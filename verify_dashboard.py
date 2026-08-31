import urllib.request
import json
import time

def run_tests():
    base = 'http://127.0.0.1:5000'
    print("Testing VisionTraffic AI Web Dashboard & Backend...\n")

    # 1. Test GET /
    res = urllib.request.urlopen(f'{base}/')
    assert res.status == 200
    html = res.read().decode('utf-8')
    assert 'VisionTraffic' in html
    assert 'Total Vehicles Counted' in html
    print("[PASS] 1. GET / - Serves valid modern frontend HTML (200 OK)")

    # 2. Test GET /api/stats
    res = urllib.request.urlopen(f'{base}/api/stats')
    assert res.status == 200
    stats = json.loads(res.read().decode('utf-8'))
    assert 'counter' in stats
    assert 'fps' in stats
    assert 'vpm' in stats
    assert 'density' in stats
    print(f"[PASS] 2. GET /api/stats - Live telemetry verified (Count: {stats['counter']}, FPS: {stats['fps']}, VPM: {stats['vpm']}, Density: {stats['density']})")

    # 3. Test POST /api/config
    test_config = {
        'count_line_position': 560,
        'min_width_react': 85,
        'min_hieght_react': 85,
        'offset': 8
    }
    req = urllib.request.Request(
        f'{base}/api/config',
        data=json.dumps(test_config).encode('utf-8'),
        headers={'Content-Type': 'application/json'}
    )
    res = urllib.request.urlopen(req)
    assert res.status == 200
    res_data = json.loads(res.read().decode('utf-8'))
    assert res_data['config']['count_line_position'] == 560
    assert res_data['config']['min_width_react'] == 85
    print("[PASS] 3. POST /api/config - Parameter hot-reloading verified (Line: 560, MinW: 85)")

    # 4. Test GET /video_feed stream
    stream_req = urllib.request.urlopen(f'{base}/video_feed', timeout=3)
    content_type = stream_req.headers.get('Content-Type')
    assert 'multipart/x-mixed-replace' in content_type
    sample_chunk = stream_req.read(4096)
    assert len(sample_chunk) > 0
    print(f"[PASS] 4. GET /video_feed - Real-time MJPEG video stream verified ({content_type})")

    # 5. Test GET /mask_feed stream
    mask_req = urllib.request.urlopen(f'{base}/mask_feed', timeout=3)
    mask_content_type = mask_req.headers.get('Content-Type')
    assert 'multipart/x-mixed-replace' in mask_content_type
    mask_chunk = mask_req.read(4096)
    assert len(mask_chunk) > 0
    print(f"[PASS] 5. GET /mask_feed - MOG2 Background Subtractor Mask stream verified")

    # 6. Test GET /api/logs
    res = urllib.request.urlopen(f'{base}/api/logs')
    assert res.status == 200
    logs = json.loads(res.read().decode('utf-8'))
    assert 'events' in logs
    print(f"[PASS] 6. GET /api/logs - Activity log storage verified ({logs['total']} events logged)")

    # Reset back to default 550
    default_config = {
        'count_line_position': 550,
        'min_width_react': 80,
        'min_hieght_react': 80,
        'offset': 6
    }
    req = urllib.request.Request(
        f'{base}/api/config',
        data=json.dumps(default_config).encode('utf-8'),
        headers={'Content-Type': 'application/json'}
    )
    urllib.request.urlopen(req)
    print("\n[SUCCESS] All 6 test suites PASSED with 100% success rate!")

if __name__ == '__main__':
    run_tests()
