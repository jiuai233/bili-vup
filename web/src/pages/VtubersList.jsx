import React, { useEffect, useState } from "react";
import { Table, Typography, Avatar, Card, Space, Input, Select, InputNumber, Button, message, Tooltip, Popconfirm, List, Tag, Modal, Form, Progress } from "antd";
import { StarOutlined, StarFilled, DeleteOutlined, StopOutlined, CloudDownloadOutlined, CheckCircleOutlined, CloseCircleOutlined, QrcodeOutlined, SyncOutlined } from "@ant-design/icons";
import { QRCodeSVG } from 'qrcode.react';
import { useOutletContext } from "react-router-dom";
import api from '../utils/api';

const { Title, Text } = Typography;
const { Search } = Input;
const { Option } = Select;

export default function VtubersList() {
  const { isMobile } = useOutletContext() || {};
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  
  const [keyword, setKeyword] = useState("");
  const [searchType, setSearchType] = useState("uname");
  const [minVideos, setMinVideos] = useState(null);
  const [maxVideos, setMaxVideos] = useState(null);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 });

  const [isImportModalVisible, setIsImportModalVisible] = useState(false);
  const [importForm] = Form.useForm();
  const [activeJobId, setActiveJobId] = useState(null);
  const [jobStatus, setJobStatus] = useState(null);

  // QR Login States
  const [qrModalVisible, setQrModalVisible] = useState(false);
  const [qrData, setQrData] = useState(null);
  const [qrStatus, setQrStatus] = useState('waiting'); 
  const [qrMessage, setQrMessage] = useState('请使用哔哩哔哩移动端扫码');

  useEffect(() => {
    let interval;
    if (qrModalVisible && qrData?.qrcode_key && qrStatus === 'waiting') {
       interval = setInterval(async () => {
           try {
               const res = await api.get(`/bilibili/qrcode/poll?qrcode_key=${qrData.qrcode_key}&transient=true`);
               if (res.data.success && res.data.code === 0) {
                   setQrStatus('success');
                   setQrMessage(res.data.message);
                   importForm.setFieldsValue({ 
                       customCookie: res.data.encrypted_cookie,
                       targetUid: res.data.logged_in_uid || ''
                   });
                   message.success("跨域扫描成功！目标 UID 和密文凭证已装填完成！");
                   setTimeout(() => {
                       setQrModalVisible(false);
                   }, 1500);
               } else if (res.data.code === 86038) {
                   setQrStatus('expired');
                   setQrMessage("二维码已过期，请刷新重试");
               } else if (res.data.code === 86090) {
                   setQrMessage("已扫码，请在手机端点击确认登录");
               }
           } catch (e) {
               console.error("Poll error", e);
           }
       }, 2000);
    }
    return () => clearInterval(interval);
  }, [qrModalVisible, qrData, qrStatus, importForm]);

  const openQrScanner = async () => {
      setQrModalVisible(true);
      setQrStatus('waiting');
      setQrData(null);
      setQrMessage('正在向 B 站申请临时跨域通行证...');
      try {
          const res = await api.get('/bilibili/qrcode/generate');
          if (res.data.success) {
              setQrData({ url: res.data.url, qrcode_key: res.data.qrcode_key });
              setQrMessage('请使用哔哩哔哩移动端扫码');
          }
      } catch(e) {
          setQrStatus('expired');
          setQrMessage('请求二维码失败');
      }
  };

  useEffect(() => {
    let interval;
    if (activeJobId && (!jobStatus || (jobStatus.status !== 'done' && jobStatus.status !== 'failed'))) {
      interval = setInterval(async () => {
        try {
           const res = await api.get(`/jobs/${activeJobId}`);
           if (res.data.success) {
               setJobStatus(res.data.job);
               if (res.data.job.status === 'done') {
                   message.success("导入已完成！");
                   // 延时刷新
                   setTimeout(() => {
                       fetchData(1, pagination.pageSize, keyword, searchType, minVideos, maxVideos);
                       setPagination(prev => ({...prev, current: 1}));
                   }, 1000);
               }
           }
        } catch (e) {
           console.error(e);
        }
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [activeJobId, jobStatus]);

  const handleImportSubmit = async (values) => {
      try {
          const res = await api.post("/jobs/import-followings", {
              targetUid: values.targetUid,
              customCookie: values.customCookie
          });
          if (res.data.success) {
              setActiveJobId(res.data.jobId);
              setJobStatus({ status: 'pending', progress_page: 0, imported_count: 0 });
              message.success("后台任务已排队...");
          }
      } catch (err) {
          message.error("提交失败");
      }
  };
  
  const handleCloseModal = () => {
      setIsImportModalVisible(false);
      if (jobStatus && (jobStatus.status === 'done' || jobStatus.status === 'failed')) {
          setActiveJobId(null);
          setJobStatus(null);
          importForm.resetFields();
      }
  };

  const fetchData = async (page, pageSize, searchVal, typeVal, minV, maxV) => {
    setLoading(true);
    try {
      let url = `/vtubers?page=${page}&pageSize=${pageSize}&search=${encodeURIComponent(searchVal)}&type=${typeVal}`;
      if (minV !== null && minV !== undefined) url += `&minVideos=${minV}`;
      if (maxV !== null && maxV !== undefined) url += `&maxVideos=${maxV}`;

      const response = await api.get(url);
      const payload = response.data;
      
      setData(payload.items || []);
      setTotal(payload.total || 0);
    } catch (error) {
      if (error.response?.status !== 401) {
          message.error(error.response?.data?.message || "获取数据失败");
      }
    } finally {
      setLoading(false);
    }
  };

  const togglePriority = async (record) => {
      try {
          const newPrio = record.priority > 0 ? 0 : 100;
          const res = await api.put(`/vtubers/${record.uid}/priority`, { priority: newPrio });
          if(res.data.success) {
              message.success(`已${newPrio > 0 ? '设为核心监控' : '取消核心监控'} (UID: ${record.uid})`);
              const newData = data.map(item => {
                  if (item.uid === record.uid) {
                      return { ...item, priority: newPrio };
                  }
                  return item;
              });
              setData(newData);
          }
      } catch (err) {
          message.error("调整权重失败");
      }
  };

  const handleDisable = async (uid, uname) => {
      try {
          // Status 0 means ban/disable
          const res = await api.put(`/vtubers/${uid}/toggle-status`, { status: 0 });
          if(res.data.success) {
              message.success(`已封禁: ${uname}，所有记录将在前端隐藏`);
              setData(data.filter(item => item.uid !== uid));
              setTotal(total - 1);
          }
      } catch (err) {
          message.error("封禁操作失败");
      }
  };

  const handleDelete = async (uid) => {
      try {
          const res = await api.delete(`/vtubers/${uid}`);
          if(res.data.success) {
              message.success(`主播(UID: ${uid})已从收容库抹除`);
              setData(data.filter(item => item.uid !== uid));
              setTotal(total - 1);
          }
      } catch (err) {
          message.error("删除失败");
      }
  };

  useEffect(() => {
    fetchData(pagination.current, pagination.pageSize, keyword, searchType, minVideos, maxVideos);
  }, [pagination.current, pagination.pageSize, keyword, searchType, minVideos, maxVideos]);

  const handleTableChange = (newPagination) => {
    setPagination({ current: newPagination.current, pageSize: newPagination.pageSize });
  };

  const handleSearch = (value) => {
    setKeyword(value);
    setPagination((prev) => ({ ...prev, current: 1 }));
  };

  const applyVideoRangeFilter = () => {
    setPagination((prev) => ({ ...prev, current: 1 }));
  };

  const selectBefore = (
    <Select value={searchType} onChange={(val) => { setSearchType(val); setPagination((prev) => ({ ...prev, current: 1 })); }} style={{ width: 105 }}>
      <Option value="uname">搜昵称</Option>
      <Option value="uid">搜 UID</Option>
    </Select>
  );

  const columns = [
    {
      title: "主播基本面",
      dataIndex: "uname",
      key: "uname",
      width: 250,
      render: (text, record) => (
        <Space size="middle">
          <Avatar src={record.face} size="large" style={{ border: '1px solid #f0f0f0' }} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontWeight: 600, fontSize: "16px" }}>
              <a href={`https://space.bilibili.com/${record.uid}`} target="_blank" rel="noreferrer" style={{ color: "#222" }}>{text}</a>
              <Tooltip title={record.priority > 0 ? "核心监控 (高频查岗)" : "普通监控"}>
                 <span onClick={() => togglePriority(record)} style={{ cursor: 'pointer', marginLeft: 8 }}>
                     {record.priority > 0 ? <StarFilled style={{color: '#ffc107'}} /> : <StarOutlined style={{color: '#d9d9d9'}} />}
                 </span>
              </Tooltip>
            </div>
            <Text type="secondary" style={{ fontSize: "12px" }}>UID: {record.uid}</Text>
          </div>
        </Space>
      ),
    },
    {
      title: "最新粉丝快照",
      dataIndex: "follower_count",
      key: "follower_count",
      width: 150,
      render: (val) => <Text strong style={{ color: "#1677ff", fontSize: "16px" }}>{val || 0}</Text>
    },
    {
      title: "近三月收录稿件",
      dataIndex: "video_count",
      key: "video_count",
      render: (val) => val ? <Text strong style={{color: '#eb2f96'}}>{val} 稿</Text> : <Text disabled>0 稿</Text>,
    },
    {
      title: "调度优先级",
      key: "priority",
      render: (_, record) => {
         if (record.priority > 0) return <Text strong style={{color: '#fa8c16'}}>特别核心查岗</Text>;
         return <Text disabled>普通</Text>;
      }
    },
    {
      title: "最近入库时间",
      dataIndex: "created_at",
      key: "created_at",
      render: (val) => val ? new Date(val).toLocaleString("zh-CN") : "-",
    },
    {
      title: "操作",
      key: "action",
      width: 180,
      render: (_, record) => (
        <Space size="small">
          <Popconfirm
            title="执行账号封禁"
            description={`确定要把 [${record.uname}] 打入冷宫并全网隐藏吗？`}
            onConfirm={() => handleDisable(record.uid, record.uname)}
            okText="封禁"
            okButtonProps={{ danger: true }}
            cancelText="取消"
          >
            <Button type="primary" danger size="small" icon={<StopOutlined />}>禁用</Button>
          </Popconfirm>

          <Popconfirm
            title="抹除主播对象"
            description={`确定要把 [${record.uname}] 彻底移出监控库吗？`}
            onConfirm={() => handleDelete(record.uid)}
            okText="立即执行"
            cancelText="手滑了"
          >
            <Button type="text" danger size="small" icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    }
  ];

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <Title level={isMobile ? 5 : 4} style={{ margin: 0 }}>核心监控大字典</Title>
        <Text type="secondary" style={{ fontSize: isMobile ? 12 : 14 }}>本调度器系统底座拥有的所有 UP 主源。数据仅展示每日收揽的静态快照结果。</Text>
      </div>

      <Card 
        styles={{ body: { padding: isMobile ? '12px' : '24px' } }}
        title={
          <Space size="large" wrap>
             <span style={{ fontWeight: 600, fontSize: "16px" }}>库内名单 ({total} 位)</span>
             <Space>
         <div>
          <Text strong style={{ marginRight: 8, fontSize: isMobile ? 12 : 14 }}>近3月稿件过滤:</Text>
          <Space wrap size="small">
            <InputNumber min={0} placeholder="最小" value={minVideos} onChange={setMinVideos} style={{ width: 70 }} />
            <span style={{ margin: "0 4px" }}>-</span>
            <InputNumber min={0} placeholder="最大" value={maxVideos} onChange={setMaxVideos} style={{ width: 70 }} />
            <Button type="primary" onClick={applyVideoRangeFilter}>生效</Button>
          </Space>
        </div>     
        <Button icon={<CloudDownloadOutlined />} onClick={() => setIsImportModalVisible(true)}>导入关注</Button>
             </Space>
          </Space>
        } 
        variant="borderless" 
        style={{ borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}
        extra={
          <Search addonBefore={selectBefore} placeholder="检索关键词检索 UID 探长..." allowClear onSearch={handleSearch} style={{ width: isMobile ? '100%' : 380, marginTop: isMobile ? 12 : 0 }} enterButton />
        }
      >
        {isMobile ? (
          <List
            dataSource={data}
            loading={loading}
            pagination={{
              current: pagination.current,
              pageSize: pagination.pageSize,
              total: total,
              onChange: (page, pageSize) => handleTableChange({ current: page, pageSize }),
              size: 'small',
              showSizeChanger: false,
            }}
            split={true}
            renderItem={(item) => (
              <List.Item style={{ padding: '12px 0', borderBottom: '1px solid #f0f0f0' }}>
                <div style={{ display: 'flex', width: '100%', gap: 12 }}>
                  <div style={{ flexShrink: 0 }}>
                    <Avatar src={item.face} size={56} style={{ border: '1px solid #f0f0f0' }} />
                  </div>
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <a href={`https://space.bilibili.com/${item.uid}`} target="_blank" rel="noreferrer" style={{ color: '#222', fontSize: 14, fontWeight: 600 }}>{item.uname}</a>
                        <div style={{ fontSize: 12, color: '#999' }}>UID: {item.uid}</div>
                      </div>
                      <div style={{ flexShrink: 0 }}>
                         {item.priority > 0 && <Tag color="orange" style={{ margin: 0 }}>核心</Tag>}
                      </div>
                    </div>
                    
                    <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 8 }}>
                       <Space size={16} split={<span style={{ color: '#eee' }}>|</span>}>
                         <div>
                            <div style={{ fontSize: 12, color: '#999', marginBottom: 2 }}>粉丝快照</div>
                            <Text strong style={{ color: "#1677ff", fontSize: "16px" }}>{item.follower_count || 0}</Text>
                         </div>
                         <div>
                            <div style={{ fontSize: 12, color: '#999', marginBottom: 2 }}>近三月入库</div>
                            {item.video_count ? <Text strong style={{color: '#eb2f96'}}>{item.video_count} 稿</Text> : <Text disabled>0 稿</Text>}
                         </div>
                       </Space>
                       <Space size={8}>
                          <Popconfirm
                            title="封禁确认"
                            description="确定打入冷宫吗？"
                            onConfirm={() => handleDisable(item.uid, item.uname)}
                            okText="封禁"
                            okButtonProps={{ danger: true }}
                            cancelText="取消"
                          >
                            <Button type="primary" danger size="small" icon={<StopOutlined />}></Button>
                          </Popconfirm>
                          <Popconfirm
                            title="抹除确认"
                            description="彻底移出监控库吗？"
                            onConfirm={() => handleDelete(item.uid)}
                            okText="执行"
                            cancelText="取消"
                          >
                            <Button type="text" danger size="small" icon={<DeleteOutlined />}></Button>
                          </Popconfirm>
                       </Space>
                    </div>
                  </div>
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
            scroll={{ x: 900 }}
            onChange={handleTableChange}
            pagination={{
              current: pagination.current,
              pageSize: pagination.pageSize,
              total: total,
              showSizeChanger: true,
              pageSizeOptions: ['10', '20', '50'],
              showTotal: (total) => `系统共收容 ${total} 名人员`
            }}
          />
        )}
      </Card>

      <Modal
        title="✨ 一键拉取大范围关注列表"
        open={isImportModalVisible}
        onCancel={handleCloseModal}
        footer={activeJobId ? [
            <Button key="close" onClick={handleCloseModal} type={jobStatus?.status === 'done' ? "primary" : "default"}>
              {jobStatus?.status === 'done' || jobStatus?.status === 'failed' ? "关闭" : "后台运行并关闭"}
            </Button>
        ] : null}
      >
        {!activeJobId ? (
          <Form form={importForm} layout="vertical" onFinish={handleImportSubmit}>
            <Form.Item name="targetUid" label="🎯 目标大V的 B站 UID" rules={[{ required: true, message: "请输入目标UID" }]}>
              <Input placeholder="例如: 3723075" size="large" />
            </Form.Item>
            <Form.Item label="🍪 自定义 Cookie (选填)">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <Form.Item name="customCookie" noStyle>
                  <Input.TextArea placeholder="默认使用系统公用 Cookie，如遇风控或非公开关注可填入明文，或者👇免密扫码安全注入" rows={3} />
                </Form.Item>
                <Button type="dashed" block icon={<QrcodeOutlined />} onClick={openQrScanner}>
                  📱 手机扫码直打临时密文凭证 (无明文泄露)
                </Button>
              </div>
            </Form.Item>
            <Button type="primary" htmlType="submit" size="large" block icon={<CloudDownloadOutlined />}>
              发射！立刻调度抓取
            </Button>
          </Form>
        ) : (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            {jobStatus?.status === 'pending' && (
              <div>
                 <h3>等待 Worker 接单中...</h3>
                 <p style={{color: '#999'}}>队伍可能在忙，请稍候</p>
              </div>
            )}
            {jobStatus?.status === 'running' && (
              <div>
                 <h3>🏃 Worker 疯狂搬运中...</h3>
                 <Progress percent={100} status="active" showInfo={false} style={{ marginBottom: 16 }} />
                 <Space size="large">
                    <div style={{textAlign: 'center'}}>
                      <div style={{fontSize: 12, color: '#999'}}>已探索页数</div>
                      <div style={{fontSize: 24, fontWeight: 'bold'}}>{jobStatus.progress_page || 0}</div>
                    </div>
                    <div style={{textAlign: 'center'}}>
                      <div style={{fontSize: 12, color: '#999'}}>已入库人数</div>
                      <div style={{fontSize: 24, fontWeight: 'bold', color: '#1677ff'}}>{jobStatus.imported_count || 0}</div>
                    </div>
                 </Space>
              </div>
            )}
            {jobStatus?.status === 'done' && (
              <div>
                 <CheckCircleOutlined style={{ fontSize: 48, color: '#52c41a', marginBottom: 16 }} />
                 <h3>搬运圆满完成！</h3>
                 <p>成功收容 <strong>{(jobStatus.imported_count || 0)}</strong> 位目标！</p>
              </div>
            )}
            {jobStatus?.status === 'failed' && (
              <div>
                 <CloseCircleOutlined style={{ fontSize: 48, color: '#ff4d4f', marginBottom: 16 }} />
                 <h3>执行意外中止</h3>
                 <p style={{color: '#ff4d4f'}}>{jobStatus.error_message || '未知错误'}</p>
                 <Button onClick={() => setActiveJobId(null)} style={{marginTop: 8}}>重试新任务</Button>
              </div>
            )}
          </div>
        )}
      </Modal>

    <Modal
         title="获取 B站跨域临时通行证"
         open={qrModalVisible}
         onCancel={() => setQrModalVisible(false)}
         footer={null}
         width={380}
         centered
      >
         <div style={{ textAlign: 'center', padding: '10px 0' }}>
            {qrStatus === 'success' ? (
                <div>
                   <CheckCircleOutlined style={{ fontSize: 54, color: '#52c41a', marginBottom: 16 }} />
                   <Title level={4}>授权大成功！</Title>
                   <Text type="secondary">{qrMessage}</Text>
                </div>
            ) : qrData ? (
                <div style={{ position: 'relative', display: 'inline-block' }}>
                   <QRCodeSVG 
                      value={qrData.url} 
                      size={200} 
                      level="H"
                      imageSettings={{
                          src: "https://i0.hdslb.com/bfs/archive/48dcb1a1a5b8daabbdbcf826cd3bbdeab227b686.png",
                          height: 48,
                          width: 48,
                          excavate: true,
                      }} 
                   />
                   {qrStatus === 'expired' && (
                     <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(255,255,255,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                         <Text type="danger" strong style={{ marginBottom: 16 }}>二维码已失效</Text>
                         <Button type="primary" icon={<SyncOutlined />} onClick={openQrScanner}>刷新重试</Button>
                     </div>
                   )}
                </div>
            ) : (
                <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                   <SyncOutlined spin style={{ fontSize: 32, color: '#1677ff' }} />
                </div>
            )}
            
            {qrStatus !== 'success' && (
               <div style={{ marginTop: 24 }}>
                  <Text strong style={{ fontSize: 16 }}>{qrMessage}</Text>
               </div>
            )}
         </div>
      </Modal>

    </div>
  );
}
