// Supabase Edge Function for 久坐提醒推送
// 部署到 Supabase Edge Functions

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // 处理 CORS 预检请求
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 创建 Supabase 客户端
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    const { minutes, title = '该休息啦', body = '起来活动一下，喝口水 👟' } = await req.json()

    if (!minutes || minutes < 1 || minutes > 180) {
      return new Response(
        JSON.stringify({ error: '无效的提醒间隔' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // 计算提醒时间
    const reminderTime = new Date(Date.now() + minutes * 60 * 1000)

    // 保存提醒到数据库
    const { data: reminder, error: reminderError } = await supabaseClient
      .from('reminders')
      .insert({
        minutes,
        reminder_time: reminderTime.toISOString(),
        title,
        body,
        status: 'scheduled'
      })
      .select()
      .single()

    if (reminderError) {
      throw new Error(`保存提醒失败: ${reminderError.message}`)
    }

    // 获取所有活跃的推送订阅
    const { data: subscriptions, error: subError } = await supabaseClient
      .from('push_subscriptions')
      .select('subscription')

    if (subError) {
      throw new Error(`获取订阅失败: ${subError.message}`)
    }

    // 发送推送通知
    const pushPromises = subscriptions.map(async (sub) => {
      try {
        const response = await fetch(sub.subscription.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `key=${Deno.env.get('FCM_SERVER_KEY')}`,
            'TTL': '86400'
          },
          body: JSON.stringify({
            title,
            body,
            icon: '/icon-192.png',
            badge: '/icon-192.png',
            data: {
              reminderId: reminder.id,
              reminderTime: reminderTime.toISOString()
            }
          })
        })

        if (!response.ok) {
          console.error(`推送失败: ${response.status} ${response.statusText}`)
        }
      } catch (error) {
        console.error('推送错误:', error)
      }
    })

    await Promise.allSettled(pushPromises)

    return new Response(
      JSON.stringify({ 
        success: true, 
        reminderId: reminder.id,
        reminderTime: reminderTime.toISOString(),
        message: `已设置 ${minutes} 分钟后提醒`
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Edge Function 错误:', error)
    
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})

// 定时检查并发送到期提醒的 Edge Function
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 查找到期的提醒
    const { data: expiredReminders, error: fetchError } = await supabaseClient
      .from('reminders')
      .select('*')
      .eq('status', 'scheduled')
      .lte('reminder_time', new Date().toISOString())

    if (fetchError) {
      throw new Error(`查询到期提醒失败: ${fetchError.message}`)
    }

    if (expiredReminders.length === 0) {
      return new Response(
        JSON.stringify({ message: '没有到期的提醒' }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // 获取所有推送订阅
    const { data: subscriptions, error: subError } = await supabaseClient
      .from('push_subscriptions')
      .select('subscription')

    if (subError) {
      throw new Error(`获取订阅失败: ${subError.message}`)
    }

    // 发送所有到期提醒
    for (const reminder of expiredReminders) {
      // 更新提醒状态
      await supabaseClient
        .from('reminders')
        .update({ status: 'sent' })
        .eq('id', reminder.id)

      // 发送推送通知
      const pushPromises = subscriptions.map(async (sub) => {
        try {
          const response = await fetch(sub.subscription.endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `key=${Deno.env.get('FCM_SERVER_KEY')}`,
              'TTL': '86400'
            },
            body: JSON.stringify({
              title: reminder.title,
              body: reminder.body,
              icon: '/icon-192.png',
              badge: '/icon-192.png',
              data: {
                reminderId: reminder.id,
                type: 'reminder'
              }
            })
          })

          if (!response.ok) {
            console.error(`推送失败: ${response.status} ${response.statusText}`)
          }
        } catch (error) {
          console.error('推送错误:', error)
        }
      })

      await Promise.allSettled(pushPromises)
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        sentCount: expiredReminders.length,
        message: `已发送 ${expiredReminders.length} 个提醒`
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('定时检查错误:', error)
    
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
