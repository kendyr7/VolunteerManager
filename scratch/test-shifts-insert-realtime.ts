import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(url, anonKey);

const volunteerId = '6eb96ab6-1b01-41a5-8f85-ad0c3188c790';

async function main() {
    console.log('==============================================');
    console.log(' REALTIME ISOLATED INSERT TEST');
    console.log('==============================================');

    const channel = supabase
        .channel(`isolated-shifts-test-${Date.now()}`)
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'shifts',
            },
            (payload) => {
                console.log('\n🎯 INSERT RECEIVED!');
                console.log(JSON.stringify(payload, null, 2));
            }
        )
        .subscribe((status) => {
            console.log('CHANNEL STATUS:', status);

            if (status === 'SUBSCRIBED') {
                console.log('\n✅ Realtime subscription is ACTIVE');
                console.log('Now execute the INSERT in Supabase SQL Editor.\n');
            }
        });

    // Mantener el proceso vivo durante 60 segundos
    await new Promise((resolve) => setTimeout(resolve, 60000));

    await supabase.removeChannel(channel);

    console.log('\nTest finished.');
}

main().catch((error) => {
    console.error('❌ TEST ERROR:', error);
    process.exit(1);
});