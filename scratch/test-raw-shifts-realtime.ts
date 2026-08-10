import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(url, anonKey);

console.log('Connecting raw Supabase Realtime...');

const channel = supabase
    .channel(`raw-shifts-test-${Date.now()}`)
    .on(
        'postgres_changes',
        {
            event: '*',
            schema: 'public',
            table: 'shifts',
        },
        (payload) => {
            console.log('\n================================');
            console.log('🔥 RAW REALTIME EVENT');
            console.log('Event:', payload.eventType);
            console.log('New:', payload.new);
            console.log('Old:', payload.old);
            console.log('================================\n');
        }
    )
    .subscribe((status, err) => {
        console.log('Realtime status:', status);

        if (err) {
            console.error('Realtime error:', err);
        }
    });

console.log('Waiting for events...');

process.on('SIGINT', async () => {
    console.log('\nClosing...');
    await supabase.removeChannel(channel);
    process.exit(0);
});