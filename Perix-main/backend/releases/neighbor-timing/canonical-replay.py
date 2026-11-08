"""Canonical real-journey replay plus degraded-motion fallback checks."""
from pathlib import Path

T = Path(__file__).parent
source = (T / 'perix-sparse-replay.py').read_text(encoding='utf-8')
source = source.replace('perix-sparse-realtime-release', 'perix-neighbor-timing-release')
source = source.replace('        # Exercise a real physics plan', '''        from mobility.motion.timeline_fallback import position_from_timeline, clear_fallback_cache
        fallback_rows=[]
        clear_fallback_cache()
        for now in [18*3600+6*60,18*3600+6*60+30,18*3600+7*60]:
            start=time.perf_counter()
            projected=position_from_timeline(**kwargs,timeline=timeline,now_sec=now)
            assert projected['motion_quality']=='TIMELINE_CONSTRAINED_FALLBACK'
            assert projected['progress_m']<path['stop_progress'][am_index]
            assert projected['effective_timeline'][am_index]['source_predicted_arrival']==65247
            assert projected['signal_stop_count']==projected['traffic_edge_count']==0
            index=projected['next_timeline_index']
            fallback_rows.append({'service_s':now,'progress_m':round(projected['progress_m'],2),
                'next_stop_id':projected['effective_timeline'][index]['stop_id'],
                'eta_seconds':max(0,projected['effective_timeline'][index]['predicted_arrival']-now),
                'elapsed_ms':round((time.perf_counter()-start)*1000,2)})
        # Exercise a real physics plan''')
source = source.replace("'rows':rows,'cold_ms'", "'rows':rows,'fallback_rows':fallback_rows,'cold_ms'")
exec(compile(source, str(Path(__file__)), 'exec'))
