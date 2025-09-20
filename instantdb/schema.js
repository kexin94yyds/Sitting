// Docs: https://www.instantdb.com/docs/modeling-data

import { i } from "https://cdn.jsdelivr.net/npm/@instantdb/core@0.8.0/dist/index.js";

const _schema = i.schema({
  entities: {
    // 原有的文件实体
    "$files": i.entity({
      "path": i.string().unique().indexed(),
      "url": i.string().optional(),
    }),
    
    // 原有的用户实体
    "$users": i.entity({
      "email": i.string().unique().indexed().optional(),
    }),

    // 推送订阅表 - 存储用户的推送通知订阅信息
    "push_subscriptions": i.entity({
      "subscription": i.object(), // 推送订阅对象
      "user_agent": i.string().optional(), // 用户代理信息
      "created_at": i.string(), // 创建时间
    }),

    // 提醒表 - 存储提醒任务
    "reminders": i.entity({
      "minutes": i.number(), // 提醒间隔（分钟）
      "reminder_time": i.string(), // 提醒时间
      "title": i.string(), // 提醒标题
      "body": i.string(), // 提醒内容
      "status": i.string(), // 状态：'scheduled', 'sent', 'cancelled'
      "created_at": i.string(), // 创建时间
    }),

    // 用户设置表 - 存储用户偏好设置
    "user_settings": i.entity({
      "user_id": i.string().optional(), // 用户ID（可选，支持匿名用户）
      "default_interval": i.number().optional(), // 默认提醒间隔
      "is_active": i.boolean().optional(), // 是否激活
      "created_at": i.string(), // 创建时间
    }),

    // 提醒历史表 - 记录已发送的提醒
    "reminder_history": i.entity({
      "reminder_id": i.string(), // 关联的提醒ID
      "sent_at": i.string(), // 发送时间
      "notification_type": i.string().optional(), // 通知类型
      "user_response": i.string().optional(), // 用户响应：'dismissed', 'restarted'
    }),
  },
  
  links: {
    // 用户与设置的关系
    "$users": {
      "settings": i.link("user_settings", "user_id"),
    },
    
    // 提醒与历史的关系
    "reminders": {
      "history": i.link("reminder_history", "reminder_id"),
    },
  },
  
  rooms: {
    // 全局房间 - 所有用户共享
    "global": {
      "reminders": i.link("reminders"),
      "push_subscriptions": i.link("push_subscriptions"),
    },
    
    // 用户房间 - 每个用户独立
    "user": {
      "settings": i.link("user_settings"),
      "reminder_history": i.link("reminder_history"),
    }
  }
});

// Export the schema for use in the application
export default _schema;