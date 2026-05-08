import React, { useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";
import {
  Avatar,
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  InputNumber,
  List,
  message,
  Modal,
  Popconfirm,
  Progress,
  QRCode,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from "antd";
import {
  CheckCircleOutlined,
  CloudDownloadOutlined,
  CloseCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  QrcodeOutlined,
  StarFilled,
  StarOutlined,
  StopOutlined,
  SyncOutlined,
} from "@ant-design/icons";
import { useOutletContext } from "react-router-dom";
import api from "../utils/api";
import { getUserTagColor } from "../utils/tagColors";

const { Title, Text } = Typography;
const { Search } = Input;
const { RangePicker } = DatePicker;

function formatDateTime(value) {
  return value ? dayjs(value).format("YYYY/MM/DD HH:mm:ss") : "-";
}

function TagChips({ tags, currentUser, onManage }) {
  return (
    <Space size={[6, 6]} wrap>
      {(tags || []).map((tag) => (
        <Tag key={tag.id} color={getUserTagColor(tag.username)}>
          {tag.username}: {tag.tag_text}
        </Tag>
      ))}
      <Button size="small" type="link" onClick={onManage}>
        {(tags || []).some((tag) => tag.username === currentUser) ? "管理标签" : "添加标签"}
      </Button>
    </Space>
  );
}

export default function VtubersDesk({ favoritesOnly = false }) {
  const { isMobile } = useOutletContext() || {};
  const currentUser = localStorage.getItem("bili_user") || "";

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 });

  const [keyword, setKeyword] = useState("");
  const [searchType, setSearchType] = useState("uname");
  const [minVideos, setMinVideos] = useState(null);
  const [maxVideos, setMaxVideos] = useState(null);
  const [tagKeyword, setTagKeyword] = useState("");
  const [checkedRange, setCheckedRange] = useState([]);
  const [sortField, setSortField] = useState("last_checked_at");
  const [sortOrder, setSortOrder] = useState("DESC");

  const [isImportModalVisible, setIsImportModalVisible] = useState(false);
  const [importForm] = Form.useForm();
  const [activeJobId, setActiveJobId] = useState(null);
  const [jobStatus, setJobStatus] = useState(null);

  const [qrModalVisible, setQrModalVisible] = useState(false);
  const [qrData, setQrData] = useState(null);
  const [qrStatus, setQrStatus] = useState("waiting");
  const [qrMessage, setQrMessage] = useState("请使用哔哩哔哩手机客户端扫码");

  const [tagModalVisible, setTagModalVisible] = useState(false);
  const [tagModalLoading, setTagModalLoading] = useState(false);
  const [currentVtuber, setCurrentVtuber] = useState(null);
  const [tagItems, setTagItems] = useState([]);
  const [newTagText, setNewTagText] = useState("");
  const [editingTagId, setEditingTagId] = useState(null);
  const [editingTagText, setEditingTagText] = useState("");

  const checkedFrom = checkedRange?.[0] ? checkedRange[0].format("YYYY-MM-DD") : "";
  const checkedTo = checkedRange?.[1] ? checkedRange[1].format("YYYY-MM-DD") : "";

  const fetchData = async ({
    page = pagination.current,
    pageSize = pagination.pageSize,
    searchValue = keyword,
    typeValue = searchType,
    minValue = minVideos,
    maxValue = maxVideos,
    tagValue = tagKeyword,
    fromValue = checkedFrom,
    toValue = checkedTo,
    sortFieldValue = sortField,
    sortOrderValue = sortOrder,
  } = {}) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        search: searchValue,
        type: typeValue,
        sortField: sortFieldValue,
        sortOrder: sortOrderValue,
      });

      if (favoritesOnly) params.set("favorites", "1");
      if (minValue !== null && minValue !== undefined) params.set("minVideos", String(minValue));
      if (maxValue !== null && maxValue !== undefined) params.set("maxVideos", String(maxValue));
      if (tagValue) params.set("tag", tagValue);
      if (fromValue) params.set("updatedFrom", fromValue);
      if (toValue) params.set("updatedTo", toValue);

      const response = await api.get(`/vtubers?${params.toString()}`);
      setData(response.data.items || []);
      setTotal(response.data.total || 0);
    } catch (error) {
      if (error.response?.status !== 401) {
        message.error(error.response?.data?.message || "获取主播列表失败");
      }
    } finally {
      setLoading(false);
    }
  };

  const refreshCurrentPage = () => fetchData();

  useEffect(() => {
    fetchData();
  }, [
    pagination.current,
    pagination.pageSize,
    keyword,
    searchType,
    minVideos,
    maxVideos,
    tagKeyword,
    checkedFrom,
    checkedTo,
    sortField,
    sortOrder,
    favoritesOnly,
  ]);

  useEffect(() => {
    let interval;
    if (qrModalVisible && qrData?.qrcode_key && qrStatus === "waiting") {
      interval = setInterval(async () => {
        try {
          const res = await api.get(`/bilibili/qrcode/poll?qrcode_key=${qrData.qrcode_key}&transient=true`);
          if (res.data.success && res.data.code === 0) {
            setQrStatus("success");
            setQrMessage(res.data.message);
            importForm.setFieldsValue({
              customCookie: res.data.encrypted_cookie,
              targetUid: res.data.logged_in_uid || "",
            });
            message.success("扫码成功，已自动填入临时凭证和账号 UID");
            setTimeout(() => setQrModalVisible(false), 1200);
          } else if (res.data.code === 86038) {
            setQrStatus("expired");
            setQrMessage("二维码已过期，请刷新重试");
          } else if (res.data.code === 86090) {
            setQrMessage("已扫码，请在手机端确认登录");
          }
        } catch (error) {
          console.error("poll qrcode failed", error);
        }
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [qrModalVisible, qrData, qrStatus, importForm]);

  useEffect(() => {
    let interval;
    if (activeJobId && (!jobStatus || !["done", "failed"].includes(jobStatus.status))) {
      interval = setInterval(async () => {
        try {
          const res = await api.get(`/jobs/${activeJobId}`);
          if (res.data.success) {
            setJobStatus(res.data.job);
            if (res.data.job.status === "done") {
              message.success("导入任务已完成");
              setTimeout(() => refreshCurrentPage(), 800);
            }
          }
        } catch (error) {
          console.error("poll job failed", error);
        }
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [activeJobId, jobStatus]);

  const openQrScanner = async () => {
    setQrModalVisible(true);
    setQrStatus("waiting");
    setQrData(null);
    setQrMessage("正在向 B 站申请二维码...");
    try {
      const res = await api.get("/bilibili/qrcode/generate");
      if (res.data.success) {
        setQrData({ url: res.data.url, qrcode_key: res.data.qrcode_key });
        setQrMessage("请使用哔哩哔哩手机客户端扫码");
      }
    } catch {
      setQrStatus("expired");
      setQrMessage("二维码获取失败");
    }
  };

  const handleImportSubmit = async (values) => {
    try {
      const res = await api.post("/jobs/import-followings", {
        targetUid: values.targetUid,
        customCookie: values.customCookie,
      });
      if (res.data.success) {
        setActiveJobId(res.data.jobId);
        setJobStatus({ status: "pending", progress_page: 0, imported_count: 0 });
        message.success("导入任务已提交到后台");
      }
    } catch {
      message.error("提交导入任务失败");
    }
  };

  const handleCloseImportModal = () => {
    setIsImportModalVisible(false);
    if (jobStatus && ["done", "failed"].includes(jobStatus.status)) {
      setActiveJobId(null);
      setJobStatus(null);
      importForm.resetFields();
    }
  };

  const toggleFavorite = async (record) => {
    try {
      const nextValue = record.is_favorite ? 0 : 1;
      await api.put(`/vtubers/${record.uid}/favorite`, { is_favorite: nextValue });
      message.success(nextValue ? "已加入收藏" : "已取消收藏");
      refreshCurrentPage();
    } catch {
      message.error("更新收藏状态失败");
    }
  };

  const handleDisable = async (uid, uname) => {
    try {
      await api.put(`/vtubers/${uid}/toggle-status`, { status: 0 });
      message.success(`已停用 ${uname}`);
      refreshCurrentPage();
    } catch {
      message.error("停用失败");
    }
  };

  const handleDelete = async (uid) => {
    try {
      await api.delete(`/vtubers/${uid}`);
      message.success("删除成功");
      refreshCurrentPage();
    } catch {
      message.error("删除失败");
    }
  };

  const loadTags = async (uid) => {
    setTagModalLoading(true);
    try {
      const res = await api.get(`/vtubers/${uid}/tags`);
      setTagItems(res.data.items || []);
    } catch {
      message.error("加载标签失败");
    } finally {
      setTagModalLoading(false);
    }
  };

  const openTagModal = async (record) => {
    setCurrentVtuber(record);
    setTagModalVisible(true);
    setNewTagText("");
    setEditingTagId(null);
    setEditingTagText("");
    await loadTags(record.uid);
  };

  const addTag = async () => {
    if (!currentVtuber || !newTagText.trim()) return;
    try {
      await api.post(`/vtubers/${currentVtuber.uid}/tags`, { tagText: newTagText });
      setNewTagText("");
      await loadTags(currentVtuber.uid);
      refreshCurrentPage();
    } catch (error) {
      message.error(error.response?.data?.message || "新增标签失败");
    }
  };

  const saveEditTag = async (tagId) => {
    try {
      await api.put(`/vtuber-tags/${tagId}`, { tagText: editingTagText });
      setEditingTagId(null);
      setEditingTagText("");
      await loadTags(currentVtuber.uid);
      refreshCurrentPage();
    } catch (error) {
      message.error(error.response?.data?.message || "编辑标签失败");
    }
  };

  const deleteTag = async (tagId) => {
    try {
      await api.delete(`/vtuber-tags/${tagId}`);
      await loadTags(currentVtuber.uid);
      refreshCurrentPage();
    } catch (error) {
      message.error(error.response?.data?.message || "删除标签失败");
    }
  };

  const resetFilters = () => {
    setKeyword("");
    setSearchType("uname");
    setMinVideos(null);
    setMaxVideos(null);
    setTagKeyword("");
    setCheckedRange([]);
    setSortField("last_checked_at");
    setSortOrder("DESC");
    setPagination((prev) => ({ ...prev, current: 1 }));
  };

  const columns = useMemo(
    () => [
      {
        title: "主播",
        dataIndex: "uname",
        key: "uname",
        width: 260,
        render: (_, record) => (
          <Space>
            <Avatar src={record.face} size="large" />
            <div>
              <Space>
                <a href={`https://space.bilibili.com/${record.uid}`} target="_blank" rel="noreferrer">
                  {record.uname}
                </a>
                <Tooltip title={record.is_favorite ? "已收藏" : "加入收藏"}>
                  <span onClick={() => toggleFavorite(record)} style={{ cursor: "pointer" }}>
                    {record.is_favorite ? <StarFilled style={{ color: "#faad14" }} /> : <StarOutlined />}
                  </span>
                </Tooltip>
              </Space>
              <div>
                <Text type="secondary">UID: {record.uid}</Text>
              </div>
            </div>
          </Space>
        ),
      },
      {
        title: "最新粉丝快照",
        dataIndex: "follower_count",
        key: "follower_count",
        width: 140,
        render: (value) => <Text strong style={{ color: "#1677ff" }}>{(value || 0).toLocaleString()}</Text>,
      },
      {
        title: "近三月投稿",
        dataIndex: "video_count",
        key: "video_count",
        width: 130,
        render: (value) => <Text strong style={{ color: "#eb2f96" }}>{value || 0}</Text>,
      },
      {
        title: "标签",
        key: "tags",
        width: 340,
        render: (_, record) => (
          <TagChips tags={record.tags || []} currentUser={currentUser} onManage={() => openTagModal(record)} />
        ),
      },
      {
        title: "最近更新时间",
        dataIndex: "last_checked_at",
        key: "last_checked_at",
        width: 180,
        render: (value) => formatDateTime(value),
      },
      {
        title: "下次检测时间",
        dataIndex: "next_check_at",
        key: "next_check_at",
        width: 180,
        render: (value) => formatDateTime(value),
      },
      {
        title: "最近入库时间",
        dataIndex: "created_at",
        key: "created_at",
        width: 180,
        render: (value) => formatDateTime(value),
      },
      {
        title: "调度优先级",
        dataIndex: "priority",
        key: "priority",
        width: 120,
        render: (value) => (value > 0 ? <Tag color="orange">高频</Tag> : <Tag>普通</Tag>),
      },
      {
        title: "操作",
        key: "action",
        width: 180,
        render: (_, record) => (
          <Space size="small">
            <Popconfirm title="确认停用这个主播？" onConfirm={() => handleDisable(record.uid, record.uname)}>
              <Button size="small" danger icon={<StopOutlined />}>
                停用
              </Button>
            </Popconfirm>
            <Popconfirm title="确认删除这个主播？" onConfirm={() => handleDelete(record.uid)}>
              <Button size="small" icon={<DeleteOutlined />}>
                删除
              </Button>
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [currentUser]
  );

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Title level={isMobile ? 5 : 4} style={{ margin: 0 }}>
          {favoritesOnly ? "收藏主播" : "主播列表"}
        </Title>
        <Text type="secondary">
          {favoritesOnly ? "这里只显示已收藏的主播，可按最近更新时间和标签筛选。" : "支持按标签、最近更新时间和收藏状态筛选主播。"}
        </Text>
      </div>

      <Card
        styles={{ body: { padding: isMobile ? 12 : 24 } }}
        variant="borderless"
        style={{ borderRadius: 12, boxShadow: "0 4px 12px rgba(0,0,0,0.03)" }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: isMobile ? "flex-start" : "center",
            flexDirection: isMobile ? "column" : "row",
            gap: 16,
            marginBottom: 20,
          }}
        >
          <Space wrap size="middle">
            <span style={{ fontWeight: 600 }}>
              {favoritesOnly ? "收藏数量" : "主播数量"}：{total}
            </span>
            {!favoritesOnly ? (
              <Button icon={<CloudDownloadOutlined />} onClick={() => setIsImportModalVisible(true)}>
                导入关注
              </Button>
            ) : null}
            <Button onClick={resetFilters}>重置筛选</Button>
          </Space>

          <Search
            addonBefore={
              <Select value={searchType} onChange={setSearchType} style={{ width: 100 }}>
                <Select.Option value="uname">搜昵称</Select.Option>
                <Select.Option value="uid">搜 UID</Select.Option>
              </Select>
            }
            placeholder="搜索主播"
            allowClear
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onSearch={() => setPagination((prev) => ({ ...prev, current: 1 }))}
            style={{ width: isMobile ? "100%" : 360 }}
            enterButton
          />
        </div>

        <Space wrap size="middle" style={{ marginBottom: 20 }}>
          <Space wrap>
            <Text>近三月投稿</Text>
            <InputNumber min={0} placeholder="最小" value={minVideos} onChange={setMinVideos} style={{ width: 90 }} />
            <InputNumber min={0} placeholder="最大" value={maxVideos} onChange={setMaxVideos} style={{ width: 90 }} />
          </Space>

          <Input
            placeholder="按主播标签筛选"
            value={tagKeyword}
            onChange={(e) => setTagKeyword(e.target.value)}
            style={{ width: 180 }}
          />

          <RangePicker value={checkedRange} onChange={(values) => setCheckedRange(values || [])} />

          <Select value={sortField} style={{ width: 160 }} onChange={setSortField}>
            <Select.Option value="last_checked_at">按最近更新时间</Select.Option>
            <Select.Option value="created_at">按入库时间</Select.Option>
            <Select.Option value="next_check_at">按下次检测时间</Select.Option>
            <Select.Option value="follower_count">按粉丝数</Select.Option>
            <Select.Option value="video_count">按投稿数</Select.Option>
            <Select.Option value="priority">按调度优先级</Select.Option>
          </Select>

          <Select value={sortOrder} style={{ width: 100 }} onChange={setSortOrder}>
            <Select.Option value="DESC">倒序</Select.Option>
            <Select.Option value="ASC">正序</Select.Option>
          </Select>
        </Space>

        {isMobile ? (
          <List
            dataSource={data}
            loading={loading}
            pagination={{
              current: pagination.current,
              pageSize: pagination.pageSize,
              total,
              onChange: (page, pageSize) => setPagination({ current: page, pageSize }),
              showSizeChanger: false,
            }}
            renderItem={(item) => (
              <List.Item>
                <div style={{ width: "100%" }}>
                  <Space align="start">
                    <Avatar src={item.face} size={56} />
                    <div style={{ minWidth: 0 }}>
                      <Space wrap>
                        <a href={`https://space.bilibili.com/${item.uid}`} target="_blank" rel="noreferrer">
                          {item.uname}
                        </a>
                        {item.is_favorite ? <Tag color="gold">收藏</Tag> : null}
                      </Space>
                      <div>
                        <Text type="secondary">UID: {item.uid}</Text>
                      </div>
                      <div style={{ marginTop: 6 }}>
                        <Tooltip title={item.is_favorite ? "已收藏" : "加入收藏"}>
                          <Button
                            size="small"
                            type={item.is_favorite ? "primary" : "default"}
                            icon={item.is_favorite ? <StarFilled /> : <StarOutlined />}
                            onClick={() => toggleFavorite(item)}
                          >
                            {item.is_favorite ? "取消收藏" : "加入收藏"}
                          </Button>
                        </Tooltip>
                      </div>
                      <div style={{ marginTop: 8 }}>
                        <Text>粉丝：{(item.follower_count || 0).toLocaleString()}</Text>
                        <Text style={{ marginLeft: 12 }}>投稿：{item.video_count || 0}</Text>
                      </div>
                      <div style={{ marginTop: 8 }}>
                        <Text type="secondary">最近更新时间：{formatDateTime(item.last_checked_at)}</Text>
                      </div>
                      <div style={{ marginTop: 4 }}>
                        <Text type="secondary">下次检测时间：{formatDateTime(item.next_check_at)}</Text>
                      </div>
                      <div style={{ marginTop: 4 }}>
                        <Text type="secondary">最近入库时间：{formatDateTime(item.created_at)}</Text>
                      </div>
                      <div style={{ marginTop: 8 }}>
                        <TagChips tags={item.tags || []} currentUser={currentUser} onManage={() => openTagModal(item)} />
                      </div>
                    </div>
                  </Space>
                </div>
              </List.Item>
            )}
          />
        ) : (
          <Table
            rowKey="uid"
            columns={columns}
            dataSource={data}
            loading={loading}
            scroll={{ x: 1600 }}
            pagination={{
              current: pagination.current,
              pageSize: pagination.pageSize,
              total,
              showSizeChanger: true,
              pageSizeOptions: ["10", "20", "50"],
              onChange: (page, pageSize) => setPagination({ current: page, pageSize }),
            }}
          />
        )}
      </Card>

      <Modal
        title="导入关注列表"
        open={isImportModalVisible}
        onCancel={handleCloseImportModal}
        footer={activeJobId ? [<Button key="close" onClick={handleCloseImportModal}>关闭</Button>] : null}
      >
        {!activeJobId ? (
          <Form form={importForm} layout="vertical" onFinish={handleImportSubmit}>
            <Form.Item name="targetUid" label="目标 UID" rules={[{ required: true, message: "请输入目标 UID" }]}>
              <Input placeholder="例如 3723075" />
            </Form.Item>
            <Form.Item name="customCookie" label="自定义 Cookie（选填）">
              <Input.TextArea rows={3} placeholder="为空时使用系统默认 Cookie" />
            </Form.Item>
            <Button block icon={<QrcodeOutlined />} onClick={openQrScanner} style={{ marginBottom: 12 }}>
              手机扫码填充临时凭证
            </Button>
            <Button type="primary" htmlType="submit" block icon={<CloudDownloadOutlined />}>
              提交后台导入任务
            </Button>
          </Form>
        ) : (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            {jobStatus?.status === "pending" ? <p>等待任务开始...</p> : null}
            {jobStatus?.status === "running" ? (
              <>
                <h3>后台正在导入</h3>
                <Progress percent={100} status="active" showInfo={false} />
                <p>页数：{jobStatus.progress_page || 0}</p>
                <p>已导入：{jobStatus.imported_count || 0}</p>
              </>
            ) : null}
            {jobStatus?.status === "done" ? (
              <>
                <CheckCircleOutlined style={{ fontSize: 48, color: "#52c41a" }} />
                <p>导入完成，共处理 {jobStatus.imported_count || 0} 人</p>
              </>
            ) : null}
            {jobStatus?.status === "failed" ? (
              <>
                <CloseCircleOutlined style={{ fontSize: 48, color: "#ff4d4f" }} />
                <p>{jobStatus.error_message || "任务失败"}</p>
              </>
            ) : null}
          </div>
        )}
      </Modal>

      <Modal title="扫码获取临时 Cookie" open={qrModalVisible} onCancel={() => setQrModalVisible(false)} footer={null}>
        <div style={{ textAlign: "center" }}>
          {qrData ? <QRCode value={qrData.url} size={220} /> : <SyncOutlined spin style={{ fontSize: 32 }} />}
          <div style={{ marginTop: 16 }}>
            <Text>{qrMessage}</Text>
          </div>
        </div>
      </Modal>

      <Modal
        title={currentVtuber ? `管理主播标签：${currentVtuber.uname}` : "管理主播标签"}
        open={tagModalVisible}
        onCancel={() => setTagModalVisible(false)}
        footer={null}
      >
        <Space.Compact style={{ width: "100%", marginBottom: 16 }}>
          <Input
            placeholder="输入新标签"
            value={newTagText}
            onChange={(e) => setNewTagText(e.target.value)}
            onPressEnter={addTag}
          />
          <Button type="primary" icon={<PlusOutlined />} onClick={addTag}>
            新增
          </Button>
        </Space.Compact>

        <List
          loading={tagModalLoading}
          dataSource={tagItems}
          locale={{ emptyText: "暂无标签" }}
          renderItem={(item) => {
            const isMine = item.username === currentUser;
            return (
              <List.Item
                actions={
                  isMine
                    ? [
                        editingTagId === item.id ? (
                          <Button key="save" type="link" onClick={() => saveEditTag(item.id)}>
                            保存
                          </Button>
                        ) : (
                          <Button
                            key="edit"
                            type="link"
                            icon={<EditOutlined />}
                            onClick={() => {
                              setEditingTagId(item.id);
                              setEditingTagText(item.tag_text);
                            }}
                          >
                            编辑
                          </Button>
                        ),
                        <Popconfirm key="delete" title="确认删除这个标签？" onConfirm={() => deleteTag(item.id)}>
                          <Button type="link" danger icon={<DeleteOutlined />}>
                            删除
                          </Button>
                        </Popconfirm>,
                      ]
                    : []
                }
              >
                <Space direction="vertical" style={{ width: "100%" }} size={4}>
                  <Tag color={getUserTagColor(item.username)} style={{ width: "fit-content" }}>
                    {item.username}
                  </Tag>
                  {editingTagId === item.id ? (
                    <Input
                      value={editingTagText}
                      onChange={(e) => setEditingTagText(e.target.value)}
                      onPressEnter={() => saveEditTag(item.id)}
                    />
                  ) : (
                    <Text>{item.tag_text}</Text>
                  )}
                </Space>
              </List.Item>
            );
          }}
        />
      </Modal>
    </div>
  );
}
