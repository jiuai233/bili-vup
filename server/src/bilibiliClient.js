import crypto from "node:crypto";

const API_BASE_URL = "https://api.bilibili.com";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36";
const DEFAULT_BILIBILI_COOKIE = process.env.BILIBILI_COOKIE || "";
const WBI_KEY_TTL_MS = 60 * 60 * 1000;
const THREE_MONTHS_LABEL = 3;
const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
  33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61,
  26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36,
  20, 34, 44, 52,
];

function getMixinKey(rawKey) {
  return MIXIN_KEY_ENC_TAB.map((index) => rawKey[index]).join("").slice(0, 32);
}

function sanitizeWbiValue(value) {
  return String(value).replace(/[!'()*]/g, "");
}

function createSignedQuery(params, mixinKey) {
  const payload = { ...params, wts: Math.floor(Date.now() / 1000) };
  const query = Object.keys(payload)
    .sort()
    .map((key) => {
      const sanitized = sanitizeWbiValue(payload[key]);
      return `${encodeURIComponent(key)}=${encodeURIComponent(sanitized)}`;
    })
    .join("&");

  const wRid = crypto.createHash("md5").update(`${query}${mixinKey}`).digest("hex");
  return `${query}&w_rid=${wRid}`;
}

function subtractMonths(date, months) {
  const next = new Date(date);
  next.setMonth(next.getMonth() - months);
  return next;
}

export class BilibiliClient {
  #wbiKeys = null;
  #wbiKeysFetchedAt = 0;

  async getUserVideoStats(uid, options = {}) {
    const response = await this.#requestWbi(
      "/x/space/wbi/arc/search",
      {
        mid: uid,
        pn: 1,
        ps: 1,
        order: "pubdate",
      },
      options
    );

    return {
      count: Number(response?.data?.page?.count) || 0,
      videos: Array.isArray(response?.data?.list?.vlist)
        ? response.data.list.vlist.map(this.#toVideoSummary)
        : [],
    };
  }

  // 获取通用统计数据（粉丝数与发稿总计）
  async getUserStat(uid, options = {}) {
    const [statRes, navRes] = await Promise.all([
      this.#request(`/x/relation/stat?vmid=${uid}`, options).catch(() => ({ data: {} })),
      this.#request(`/x/space/navnum?mid=${uid}`, options).catch(() => ({ data: {} }))
    ]);
    
    return {
      follower_count: Number(statRes?.data?.follower) || 0,
      video_count: Number(navRes?.data?.video) || 0
    };
  }

  // 获取目标用户的关注列表 (分页)
  async getFollowingsPage(uid, pn = 1, options = {}) {
    const response = await this.#request(`/x/relation/followings?vmid=${uid}&pn=${pn}&ps=50&order=desc`, options);
    
    return {
      list: response?.data?.list || [],
      total: response?.data?.total || 0
    };
  }

  // 拉取全时间线最新 N 个稿件（不限时间段）
  async getLatestVideos(uid, count = 10, options = {}) {
    const response = await this.#requestWbi(
      "/x/space/wbi/arc/search",
      {
        mid: uid,
        pn: 1,
        ps: count,
        order: "pubdate",
      },
      options
    );

    const items = response?.data?.list?.vlist;
    if (!Array.isArray(items)) return [];
    return items.map(this.#toVideoSummary);
  }

  async getRecentVideos(uid, months = THREE_MONTHS_LABEL, options = {}) {
    const threshold = Math.floor(subtractMonths(new Date(), months).getTime() / 1000);
    const videos = [];
    let page = 1;

    while (true) {
      const pageItems = await this.#getUserVideos(uid, page, options);
      if (!pageItems.length) {
        break;
      }

      const recentItems = pageItems.filter((item) => Number(item.created) >= threshold);
      videos.push(...recentItems.map(this.#toVideoSummary));

      if (recentItems.length < pageItems.length) {
        break;
      }

      page += 1;
    }

    return videos;
  }

  async #getUserVideos(uid, page, options) {
    const params = {
      mid: uid,
      pn: page,
      ps: 50,
      order: "pubdate",
    };
    const response = await this.#requestWbi("/x/space/wbi/arc/search", params, options);
    const items = response?.data?.list?.vlist;

    if (!Array.isArray(items)) {
      return [];
    }

    return items;
  }

  async #signParams(params, options) {
    const keys = await this.#getWbiKeys(false, options);
    const mixinKey = getMixinKey(`${keys.imgKey}${keys.subKey}`);
    return createSignedQuery(params, mixinKey);
  }

  async #getWbiKeys(forceRefresh = false, options = {}) {
    const now = Date.now();
    if (!forceRefresh && this.#wbiKeys && now - this.#wbiKeysFetchedAt < WBI_KEY_TTL_MS) {
      return this.#wbiKeys;
    }

    const response = await this.#request("/x/web-interface/nav", {
      allowCodes: [-101],
      cookie: options.cookie,
    });
    const wbiImage = response?.data?.wbi_img;

    if (!wbiImage?.img_url || !wbiImage?.sub_url) {
      throw new Error("Failed to load WBI keys.");
    }

    this.#wbiKeys = {
      imgKey: this.#extractKey(wbiImage.img_url),
      subKey: this.#extractKey(wbiImage.sub_url),
    };
    this.#wbiKeysFetchedAt = now;

    return this.#wbiKeys;
  }

  async #request(path, options = {}) {
    const { allowCodes = [], cookie = "" } = options;
    const response = await fetch(`${API_BASE_URL}${path}`, {
      headers: {
        "User-Agent": USER_AGENT,
        Referer: "https://www.bilibili.com/",
        ...(cookie || DEFAULT_BILIBILI_COOKIE ? { Cookie: cookie || DEFAULT_BILIBILI_COOKIE } : {}),
      },
    });

    if (!response.ok) {
      throw new Error(`Bilibili API request failed with status ${response.status}.`);
    }

    const payload = await response.json();

    if (payload.code === 0) {
      return payload;
    }

    if (allowCodes.includes(payload.code)) {
      return payload;
    }

    if (payload.message?.includes("风控")) {
      throw new Error("Bilibili risk control rejected the request. Configure BILIBILI_COOKIE and retry.");
    }

    throw new Error(payload.message || "Bilibili API returned an error.");
  }

  async #requestWbi(path, params, options = {}, retried = false) {
    const query = await this.#signParams(params, options);
    const payload = await this.#request(`${path}?${query}`, {
      allowCodes: [-403],
      cookie: options.cookie,
    });

    if (payload.code === 0) {
      return payload;
    }

    if (!retried && (payload.code === -403 || payload.message?.includes("v_voucher"))) {
      await this.#getWbiKeys(true, options);
      return this.#requestWbi(path, params, options, true);
    }

    throw new Error(payload.message || "Bilibili API returned an error.");
  }

  #extractKey(url) {
    return url.slice(url.lastIndexOf("/") + 1, url.lastIndexOf("."));
  }

  #toVideoSummary(item) {
    return {
      bvid: item.bvid,
      title: item.title,
      created: Number(item.created),
      play: Number(item.play) || 0,
      comment: Number(item.comment) || 0,
      length: item.length,
      pic: item.pic?.startsWith("//") ? `https:${item.pic}` : item.pic || "",
    };
  }
}
