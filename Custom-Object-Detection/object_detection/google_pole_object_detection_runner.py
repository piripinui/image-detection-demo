import numpy as np
import os
import six.moves.urllib as urllib
import sys
import tarfile
import tensorflow as tf
import zipfile
import json
import time
import glob
import web
import time
import logging

from io import StringIO
from PIL import Image

#import matplotlib.pyplot as plt
import matplotlib
matplotlib.use('Agg')
from matplotlib import pyplot as plt

from utils import visualization_utils as vis_util
from utils import label_map_util

from multiprocessing.dummy import Pool as ThreadPool

MAX_NUMBER_OF_BOXES = 10
MINIMUM_CONFIDENCE = 0.9

PATH_TO_LABELS = 'pole_annotations/label_map.pbtxt'
PATH_TO_TEST_IMAGES_DIR = sys.argv[2];

print("Image directory = " + PATH_TO_TEST_IMAGES_DIR);

label_map = label_map_util.load_labelmap(PATH_TO_LABELS)
categories = label_map_util.convert_label_map_to_categories(label_map, max_num_classes=sys.maxsize, use_display_name=True)
CATEGORY_INDEX = label_map_util.create_category_index(categories)

# Path to frozen detection graph. This is the actual model that is used for the object detection.
MODEL_NAME = 'pole_output_inference_graph'
PATH_TO_CKPT = MODEL_NAME + '/frozen_inference_graph.pb'

def load_image_into_numpy_array(image):
    (im_width, im_height) = image.size
    return np.array(image.getdata()).reshape(
        (im_height, im_width, 3)).astype(np.uint8)

def detect_objects(image_path, sess, image_tensor, detection_boxes, detection_scores, detection_classes, num_detections):
    global scores
    global classes
    global boxes
	
    image = Image.open(image_path)
    image_np = load_image_into_numpy_array(image)
    image_np_expanded = np.expand_dims(image_np, axis=0)

    (boxes, scores, classes, num) = sess.run([detection_boxes, detection_scores, detection_classes, num_detections], feed_dict={image_tensor: image_np_expanded})

    vis_util.visualize_boxes_and_labels_on_image_array(
        image_np,
        np.squeeze(boxes),
        np.squeeze(classes).astype(np.int32),
        np.squeeze(scores),
        CATEGORY_INDEX,
        min_score_thresh=MINIMUM_CONFIDENCE,
        use_normalized_coordinates=True,
        line_thickness=8)
    fig = plt.figure()
    fig.set_size_inches(16, 9)
    ax = plt.Axes(fig, [0., 0., 1., 1.])
    ax.set_axis_off()
    fig.add_axes(ax)

    #plt.imshow(image_np, aspect = 'auto')
    plt.imshow(image_np)
    path, file = os.path.split(image_path)
    plt.savefig(PATH_TO_TEST_IMAGES_DIR + '/processed/' + file, dpi = 62)
    plt.close(fig)

# Load model into memory
print('Loading model...')
detection_graph = tf.Graph()
with detection_graph.as_default():
    od_graph_def = tf.GraphDef()
    with tf.gfile.GFile(PATH_TO_CKPT, 'rb') as fid:
        serialized_graph = fid.read()
        od_graph_def.ParseFromString(serialized_graph)
        tf.import_graph_def(od_graph_def, name='')
		
sess = tf.Session(graph=detection_graph)
def startDetection():
    global sess
    print('Detecting...')
    
    with detection_graph.as_default():
        #with tf.Session(graph=detection_graph) as sess:
            t0 = time.time()
            image_tensor = detection_graph.get_tensor_by_name('image_tensor:0')
            detection_boxes = detection_graph.get_tensor_by_name('detection_boxes:0')
            detection_scores = detection_graph.get_tensor_by_name('detection_scores:0')
            detection_classes = detection_graph.get_tensor_by_name('detection_classes:0')
            num_detections = detection_graph.get_tensor_by_name('num_detections:0')
            TEST_IMAGE_PATHS = glob.glob(os.path.join(PATH_TO_TEST_IMAGES_DIR, '*.jpg'))
            t1 = time.time()
            logging.debug("Setup time = ", str(t1 - t0))
            for image_path in TEST_IMAGE_PATHS:
                detect_objects(image_path, sess, image_tensor, detection_boxes, detection_scores, detection_classes, num_detections)

# Set up the web server.	
print("Starting web server...")	
urls = (
  '/startdetection', 'startdetection'
)

def getClasses(category_index):
    global scores
    global classes
    global boxes
	
    myBoxes = np.squeeze(boxes);
    myClasses = np.squeeze(classes).astype(np.int32)
    myScores = np.squeeze(scores)
		
    max_boxes_to_draw = 20
    str = ""
	
    myRange = min(max_boxes_to_draw, myBoxes.shape[0])
	
    strs = []
		
    for i in range(myRange):
        if myClasses[i] in category_index.keys():
            class_name = category_index[myClasses[i]]['name']
        else:
            class_name = 'N/A'
        percentScore = int(100*myScores[i])
        display_str = '{}: {}%'.format(
            class_name, percentScore)
			
        if percentScore > 90:
            strs.append(display_str)
			
    myRange = len(strs)
    for i in range(myRange):
        if i < myRange - 1:
            str += "\"" + strs[i] + "\","
        else:
            str += "\"" + strs[i] + "\""
		
    return str

class startdetection:
	
    def GET(self):
        print("Responding to detection request...")
        t0 = time.time()
        startDetection()
        t1 = time.time()
        total = t1-t0
		
        results = "{\"classes\":["
		
        results += getClasses(CATEGORY_INDEX)
		
        results += "],\"elapsed_time\":" + str(total) + "}"		
		
        return str(results)
				
if __name__ == "__main__":		
    app = web.application(urls, globals())
    app.run()