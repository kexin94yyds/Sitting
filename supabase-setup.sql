-- Supabase 数据库设置脚本
-- 在 Supabase Dashboard 的 SQL Editor 中运行此脚本

-- 创建推送订阅表
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  subscription JSONB NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建提醒表
CREATE TABLE IF NOT EXISTS reminders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  minutes INTEGER NOT NULL,
  reminder_time TIMESTAMP WITH TIME ZONE NOT NULL,
  title TEXT DEFAULT '该休息啦',
  body TEXT DEFAULT '起来活动一下，喝口水 👟',
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'sent', 'cancelled')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建用户设置表
CREATE TABLE IF NOT EXISTS user_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id TEXT UNIQUE,
  default_interval INTEGER DEFAULT 45,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_reminders_time ON reminders(reminder_time);
CREATE INDEX IF NOT EXISTS idx_reminders_status ON reminders(status);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_created ON push_subscriptions(created_at);

-- 创建更新时间触发器函数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 为表添加更新时间触发器
CREATE TRIGGER update_push_subscriptions_updated_at 
  BEFORE UPDATE ON push_subscriptions 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reminders_updated_at 
  BEFORE UPDATE ON reminders 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_settings_updated_at 
  BEFORE UPDATE ON user_settings 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 创建清理过期提醒的函数
CREATE OR REPLACE FUNCTION cleanup_expired_reminders()
RETURNS void AS $$
BEGIN
  DELETE FROM reminders 
  WHERE reminder_time < NOW() - INTERVAL '1 day' 
  AND status IN ('sent', 'cancelled');
END;
$$ LANGUAGE plpgsql;

-- 创建发送提醒的函数
CREATE OR REPLACE FUNCTION send_reminder_notification()
RETURNS void AS $$
DECLARE
  reminder_record RECORD;
  subscription_record RECORD;
BEGIN
  -- 查找到期的提醒
  FOR reminder_record IN 
    SELECT * FROM reminders 
    WHERE reminder_time <= NOW() 
    AND status = 'scheduled'
  LOOP
    -- 更新提醒状态
    UPDATE reminders 
    SET status = 'sent' 
    WHERE id = reminder_record.id;
    
    -- 这里可以添加实际的推送逻辑
    -- 由于 Supabase 的限制，我们使用数据库触发器来模拟推送
    -- 实际项目中可能需要使用 Edge Functions 或外部服务
    
    RAISE NOTICE '发送提醒: % - %', reminder_record.title, reminder_record.body;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 创建定时任务（需要 pg_cron 扩展）
-- 注意：这需要在 Supabase 中启用 pg_cron 扩展
-- SELECT cron.schedule('send-reminders', '* * * * *', 'SELECT send_reminder_notification();');

-- 启用行级安全策略
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- 创建允许匿名访问的策略（用于 PWA）
CREATE POLICY "Allow anonymous access to push_subscriptions" ON push_subscriptions
  FOR ALL USING (true);

CREATE POLICY "Allow anonymous access to reminders" ON reminders
  FOR ALL USING (true);

CREATE POLICY "Allow anonymous access to user_settings" ON user_settings
  FOR ALL USING (true);

-- 创建示例数据
INSERT INTO user_settings (user_id, default_interval, is_active) 
VALUES ('anonymous', 45, true) 
ON CONFLICT (user_id) DO NOTHING;

-- 创建视图：活跃的提醒
CREATE OR REPLACE VIEW active_reminders AS
SELECT 
  r.*,
  EXTRACT(EPOCH FROM (r.reminder_time - NOW())) / 60 as minutes_until_reminder
FROM reminders r
WHERE r.status = 'scheduled'
AND r.reminder_time > NOW()
ORDER BY r.reminder_time;

-- 创建视图：推送统计
CREATE OR REPLACE VIEW push_stats AS
SELECT 
  DATE(created_at) as date,
  COUNT(*) as total_reminders,
  COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent_reminders,
  COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_reminders
FROM reminders
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;




