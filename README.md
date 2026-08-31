# Code_Vidya-Hack_Day_PS_6
# SmartFlow AI — Real-Time Vehicle Counting System

## Project Name
**SmartFlow AI (Automated Real-Time Vehicle Counting & Traffic Monitoring System)**

## Selected Problem Statement
**PS 6 — Open Innovation** (Code Vidya Hack Day)

## Problem Description
Manual traffic monitoring and traditional sensor hardware (such as inductive loops and LiDAR) are labor-intensive, expensive, and lack real-time density analytics for automated campus traffic management.

## Proposed Solution
An edge-compatible Computer Vision system built using Python and OpenCV that automatically detects, tracks, and counts vehicles across designated road lanes using video stream processing without extra hardware.

## Key Features
* Real-time vehicle detection and automated count tracking
* Adaptive background subtraction using MOG2
* Noise elimination using morphological dilation and closing filters
* Centroid-based virtual trigger line counting mechanism
* Live HUD displaying bounding boxes, centroids, and current count

## Technologies / Tech Stack Used
* **Language:** Python 3.8+
* **Libraries:** OpenCV (`cv2`), NumPy[span_0](start_span)[span_0](end_span)
* **Editor:** Visual Studio Code

## AI Models / APIs Used
* **OpenCV Built-ins:** `createBackgroundSubtractorMOG2`[span_1](start_span)[span_1](end_span), Morphological Kernels (`MORPH_ELLIPSE`, `MORPH_CLOSE`)[span_2](start_span)[span_2](end_span), Contour Approximation (`findContours`)[span_3](start_span)[span_3](end_span).
* **Cloud APIs:** None (100% on-device/edge execution).

## How the Project Works
1. **Frame Capture:** Reads video frames via OpenCV[span_4](start_span)[span_4](end_span).
2. **Preprocessing:** Converts frame to grayscale and applies Gaussian Blur[span_5](start_span)[span_5](end_span).
3. **Motion Detection:** MOG2 subtractor isolates moving foreground objects from static backgrounds[span_6](start_span)[span_6](end_span).
4. **Morphology & Contours:** Dilates and closes masks to extract clean vehicle contours above $80 \times 80\text{ px}$[span_7](start_span)[span_7](end_span).
5. **Counting:** Computes vehicle centroid `(cx, cy)`[span_8](start_span)[span_8](end_span); increments counter when the centroid intersects the virtual trigger line within offset range[span_9](start_span)[span_9](end_span).

## Installation & Setup Instructions
```bash
# Clone the repository
git clone [https://github.com/](https://github.com/)<your-username>/Code_Vidya-Hack_Day_PS_6.git
cd Code_Vidya-Hack_Day_PS_6

# Install dependencies
pip install opencv-python numpy

## 🚀 How to Run the Project

Follow these steps to run the vehicle counter on your local machine:

1. **Add the Video Source**
   Ensure your sample traffic video (e.g., `video.mp4`) is placed in the project root directory[span_0](start_span)[span_0](end_span).

2. **Execute the Script**
   Open your terminal or command prompt inside the project directory and run[span_1](start_span)[span_1](end_span):
   ```bash
   python vehicle.py


Member: 
Noor Ahmad Khan — B.Tech CSE (Lead Developer)
