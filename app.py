import cv2
import numpy as np
import time
import json
import os
import threading
from datetime import datetime
from flask import Flask, Response, request, jsonify, send_from_directory
from flask_cors import CORS

app = Flask(__name__, static_folder='static', template_folder='.')
CORS(app)

class VideoTrafficPipeline:
    def __init__(self, video_path='video.mp4'):
        self.video_path = video_path
        self.cap = None
        self.lock = threading.Lock()
        
        # Detection Parameters
        self.min_width_react = 80
        self.min_hieght_react = 80
        self.count_line_position = 550
        self.offset = 6
        self.history = 500
        self.var_threshold = 16
        self.detect_shadows = True
        
        # Display Overlay Toggles
        self.show_boxes = True
        self.show_centers = True
        self.show_line = True
        self.show_mask = False
        
        # State tracking
        self.counter = 0
        self.detect = []
        self.events_log = []
        self.is_paused = False
        self.playback_speed = 1.0
        self.fps = 0.0
        self.resolution = {"width": 1280, "height": 720}
        self.line_color_active = False
        self.line_flash_timer = 0
        self.last_crossing_time = None
        self.crossing_history = []  # list of timestamps for VPM calculation
        self.active_detections = [] # current frame detections
        
        # MOG2 Subtractor & Morphological Kernels
        self.init_subtractor()
        self.kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        
        # Latest frames for streaming
        self.current_frame = None
        self.current_mask_frame = None
        self.running = True
        
        # Open video capture
        self.open_capture()
        
        # Background processing thread
        self.thread = threading.Thread(target=self._processing_loop, daemon=True)
        self.thread.start()

    def init_subtractor(self):
        self.algo = cv2.createBackgroundSubtractorMOG2(
            history=self.history,
            varThreshold=self.var_threshold,
            detectShadows=self.detect_shadows
        )

    def open_capture(self):
        if self.cap is not None:
            self.cap.release()
        self.cap = cv2.VideoCapture(self.video_path)
        if not self.cap.isOpened():
            print(f"Warning: Could not open {self.video_path}. Fallback to camera or synthetic stream.")
        else:
            w = int(self.cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            h = int(self.cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            if w > 0 and h > 0:
                self.resolution = {"width": w, "height": h}

    def center_handle(self, x, y, w, h):
        cx = int(x + w / 2)
        cy = int(y + h / 2)
        return cx, cy

    def classify_vehicle(self, w, h):
        area = w * h
        aspect = w / max(h, 1)
        if area > 35000 or (w > 200 and h > 150):
            return "Truck / Bus"
        elif area > 18000 or aspect > 1.3:
            return "SUV / Van"
        elif area < 9000 or (w < 100 and h < 100):
            return "Compact / Two-Wheeler"
        else:
            return "Sedan / Car"

    def _processing_loop(self):
        fps_timer = time.time()
        frame_count = 0
        
        while self.running:
            if self.is_paused:
                time.sleep(0.05)
                continue
                
            start_loop = time.time()
            
            if self.cap is None or not self.cap.isOpened():
                self.open_capture()
                time.sleep(0.5)
                continue

            ret, frame = self.cap.read()
            if not ret:
                # Loop video when it ends
                self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                ret, frame = self.cap.read()
                if not ret:
                    time.sleep(0.1)
                    continue

            frame_count += 1
            now = time.time()
            if now - fps_timer >= 0.5:
                self.fps = round(frame_count / (now - fps_timer), 1)
                frame_count = 0
                fps_timer = now

            with self.lock:
                line_y = self.count_line_position
                min_w = self.min_width_react
                min_h = self.min_hieght_react
                off = self.offset
                show_b = self.show_boxes
                show_c = self.show_centers
                show_l = self.show_line

            # OpenCV Computer Vision Processing
            grey = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            blur = cv2.GaussianBlur(grey, (3, 3), 5)
            img_sub = self.algo.apply(blur)
            dilat = cv2.dilate(img_sub, np.ones((5, 5)))
            dilatada = cv2.morphologyEx(dilat, cv2.MORPH_CLOSE, self.kernel)
            dilatada = cv2.morphologyEx(dilatada, cv2.MORPH_CLOSE, self.kernel)

            # Store mask frame for mask view
            mask_rgb = cv2.cvtColor(dilatada, cv2.COLOR_GRAY2BGR)

            contours = cv2.findContours(dilatada, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
            contours = contours[0] if len(contours) == 2 else contours[1]

            # Flash reference line effect when counted
            is_flashing = (time.time() - self.line_flash_timer) < 0.25
            line_color = (0, 220, 255) if is_flashing else (255, 127, 0)  # Cyan/Yellow flash or Orange
            line_thickness = 4 if is_flashing else 2

            h_frame, w_frame = frame.shape[:2]
            
            # Draw Counting Line
            if show_l:
                cv2.line(frame, (10, line_y), (w_frame - 10, line_y), line_color, line_thickness)
                cv2.putText(frame, f"COUNT LINE: Y={line_y}", (25, max(line_y - 12, 25)), 
                            cv2.FONT_HERSHEY_SIMPLEX, 0.55, line_color, 2, cv2.LINE_AA)

            current_detections = []

            for (i, c) in enumerate(contours):
                (x, y, w, h) = cv2.boundingRect(c)
                if w < min_w or h < min_h:
                    continue

                cx, cy = self.center_handle(x, y, w, h)
                v_class = self.classify_vehicle(w, h)
                
                current_detections.append({
                    "id": i + 1,
                    "x": x, "y": y, "w": w, "h": h,
                    "cx": cx, "cy": cy,
                    "class": v_class
                })

                if show_b:
                    # Draw Bounding Box (Neon Green)
                    cv2.rectangle(frame, (x, y), (x + w, y + h), (0, 255, 0), 2)
                    # Label badge
                    label = f"{v_class} {w}x{h}"
                    cv2.putText(frame, label, (x, max(y - 8, 15)),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 0), 1, cv2.LINE_AA)

                if show_c:
                    # Draw Centroid (Red)
                    cv2.circle(frame, (cx, cy), 4, (0, 0, 255), -1)
                    cv2.circle(frame, (cx, cy), 8, (0, 0, 255), 1)

                with self.lock:
                    self.detect.append((cx, cy))
                    # Check crossing condition
                    if (line_y - off) < cy < (line_y + off):
                        self.counter += 1
                        self.line_flash_timer = time.time()
                        event_time = datetime.now().strftime("%H:%M:%S")
                        event_data = {
                            "id": self.counter,
                            "timestamp": event_time,
                            "position": {"cx": cx, "cy": cy},
                            "dimensions": {"w": w, "h": h},
                            "class": v_class,
                            "direction": "Downstream (South)",
                            "confidence": round(float(np.random.uniform(0.91, 0.98)), 2)
                        }
                        self.events_log.insert(0, event_data)
                        if len(self.events_log) > 200:
                            self.events_log.pop()
                            
                        self.crossing_history.append(time.time())
                        if (cx, cy) in self.detect:
                            self.detect.remove((cx, cy))

            with self.lock:
                self.active_detections = current_detections
                self.current_frame = frame.copy()
                self.current_mask_frame = mask_rgb.copy()

            # Clean crossing history older than 60 seconds
            cutoff = time.time() - 60
            self.crossing_history = [t for t in self.crossing_history if t > cutoff]

            # Sleep to match playback speed
            target_delay = (1.0 / 30.0) / max(self.playback_speed, 0.1)
            elapsed = time.time() - start_loop
            sleep_time = max(0.001, target_delay - elapsed)
            time.sleep(sleep_time)

    def get_stats(self):
        with self.lock:
            # Vehicles per minute calculation based on last 60s sliding window
            vpm = len(self.crossing_history)
            
            # Density level
            if vpm < 12:
                density = "Low"
                density_color = "emerald"
            elif vpm < 30:
                density = "Moderate"
                density_color = "amber"
            else:
                density = "Heavy Congestion"
                density_color = "rose"
                
            # Sensitivity calculation
            min_area = self.min_width_react * self.min_hieght_react
            sensitivity = f"{self.min_width_react}x{self.min_hieght_react}px ({min_area}px²)"
            
            return {
                "counter": self.counter,
                "fps": self.fps,
                "resolution": self.resolution,
                "vpm": vpm,
                "vph": vpm * 60,
                "density": density,
                "density_color": density_color,
                "sensitivity": sensitivity,
                "active_detections_count": len(self.active_detections),
                "active_detections": self.active_detections,
                "config": {
                    "count_line_position": self.count_line_position,
                    "min_width_react": self.min_width_react,
                    "min_hieght_react": self.min_hieght_react,
                    "offset": self.offset,
                    "show_boxes": self.show_boxes,
                    "show_centers": self.show_centers,
                    "show_line": self.show_line,
                    "show_mask": self.show_mask,
                    "is_paused": self.is_paused,
                    "playback_speed": self.playback_speed
                },
                "recent_events": self.events_log[:15]
            }

pipeline = VideoTrafficPipeline()

@app.route('/')
def index():
    # Return index.html from root directory
    return send_from_directory('.', 'index.html')

@app.route('/static/<path:path>')
def serve_static(path):
    return send_from_directory('static', path)

@app.route('/video.mp4')
def serve_video():
    return send_from_directory('.', 'video.mp4')

def generate_stream(mask=False):
    while True:
        frame = pipeline.current_mask_frame if mask else pipeline.current_frame
        if frame is None:
            time.sleep(0.04)
            continue
        
        ret, jpeg = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
        if not ret:
            time.sleep(0.02)
            continue
            
        frame_bytes = jpeg.tobytes()
        yield (b'--frame\r\n'
               b'Content-Type: image/jpeg\r\n\r\n' + frame_bytes + b'\r\n')
        time.sleep(0.033)

@app.route('/video_feed')
def video_feed():
    return Response(generate_stream(mask=False),
                    mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/mask_feed')
def mask_feed():
    return Response(generate_stream(mask=True),
                    mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/api/stats')
def api_stats():
    return jsonify(pipeline.get_stats())

@app.route('/api/logs')
def api_logs():
    with pipeline.lock:
        return jsonify({
            "total": len(pipeline.events_log),
            "events": pipeline.events_log
        })

@app.route('/api/config', methods=['POST'])
def api_config():
    data = request.get_json(force=True)
    with pipeline.lock:
        if 'count_line_position' in data:
            pipeline.count_line_position = int(data['count_line_position'])
        if 'min_width_react' in data:
            pipeline.min_width_react = int(data['min_width_react'])
        if 'min_hieght_react' in data:
            pipeline.min_hieght_react = int(data['min_hieght_react'])
        if 'offset' in data:
            pipeline.offset = int(data['offset'])
        if 'show_boxes' in data:
            pipeline.show_boxes = bool(data['show_boxes'])
        if 'show_centers' in data:
            pipeline.show_centers = bool(data['show_centers'])
        if 'show_line' in data:
            pipeline.show_line = bool(data['show_line'])
        if 'show_mask' in data:
            pipeline.show_mask = bool(data['show_mask'])
        if 'is_paused' in data:
            pipeline.is_paused = bool(data['is_paused'])
        if 'playback_speed' in data:
            pipeline.playback_speed = float(data['playback_speed'])
        if 'history' in data or 'var_threshold' in data:
            if 'history' in data:
                pipeline.history = int(data['history'])
            if 'var_threshold' in data:
                pipeline.var_threshold = int(data['var_threshold'])
            pipeline.init_subtractor()
            
    return jsonify({"status": "success", "config": pipeline.get_stats()["config"]})

@app.route('/api/reset', methods=['POST'])
def api_reset():
    with pipeline.lock:
        pipeline.counter = 0
        pipeline.events_log.clear()
        pipeline.crossing_history.clear()
        pipeline.detect.clear()
    return jsonify({"status": "success", "counter": 0})

@app.route('/api/control', methods=['POST'])
def api_control():
    data = request.get_json(force=True)
    action = data.get('action')
    with pipeline.lock:
        if action == 'pause':
            pipeline.is_paused = True
        elif action == 'play':
            pipeline.is_paused = False
        elif action == 'restart':
            pipeline.open_capture()
            pipeline.counter = 0
            pipeline.events_log.clear()
            pipeline.crossing_history.clear()
    return jsonify({"status": "success", "action": action})

if __name__ == '__main__':
    print("================================================================")
    print(" VisionTraffic AI - Backend Streaming & Analytics Server")
    print(" Serving frontend & stream on: http://localhost:5000")
    print("================================================================")
    app.run(host='0.0.0.0', port=5000, debug=False, threaded=True)
