const cron = require('node-cron');
const supabase = require('./supabase');
const { sendPushNotification } = require('./firebase');

/**
 * Every minute, check if any timetable slot ended in the last minute.
 * If yes, send a push notification asking if the student attended.
 */
function initCronJobs() {
  // Run every minute
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();
      const dayOfWeek = now.getDay();             // 0=Sun, 1=Mon...
      const currentTime = now.toTimeString().slice(0, 5); // "HH:MM"

      // Find all slots ending right now (within this minute)
      const { data: slots, error } = await supabase
        .from('timetable_slots')
        .select(`
          id,
          end_time,
          day_of_week,
          slot_type,
          subjects (name),
          profiles!inner (id, fcm_token)
        `)
        .eq('day_of_week', dayOfWeek)
        .eq('end_time', currentTime);   // exact match HH:MM

      if (error || !slots?.length) return;

      for (const slot of slots) {
        const profile = slot.profiles;
        if (!profile?.fcm_token) continue;

        const subjectName = slot.subjects?.name || 'a class';
        const slotType = slot.slot_type || 'class';

        await sendPushNotification(
          profile.fcm_token,
          '📚 Did you attend?',
          `Your ${slotType} for ${subjectName} just ended. Did you attend?`,
          {
            type: 'attendance_prompt',
            slot_id: slot.id,
            user_id: profile.id,
          }
        );

        // Log the notification
        await supabase.from('notifications').insert({
          user_id: profile.id,
          type: 'attendance_prompt',
          title: `Did you attend ${subjectName}?`,
          body: `Your ${slotType} just ended`,
          related_id: slot.id,
        });
      }
    } catch (err) {
      console.error('Cron job error:', err.message);
    }
  });

  console.log('⏰ Cron jobs initialized');
}

module.exports = { initCronJobs };
