// base url
const baseURL = window.baseURL ?? ""

// calculate distance between two points
const getDistance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

// calculate face orientation
const getOrientation = (result, canvas) => {
  // get result landmarks
  const data = result.keypoints
  // get detection center position
  const pos_x = data[6].x - canvas.width / 2
  const pos_y = (data[6].y - canvas.height / 2) * -1
  const pos_z = 0
  // calculate rotation in x direction
  const rot_x_a = getDistance(data[197], data[168])
  const rot_x_b = getDistance(data[200], data[152])
  const rot_x = Math.asin((0.5 - rot_x_b / (rot_x_a + rot_x_b)) * 2)
  // calculate rotation in y direction
  const rot_y_a = getDistance(data[33], data[133])
  const rot_y_b = getDistance(data[362], data[263])
  const rot_y = Math.asin((0.5 - rot_y_b / (rot_y_a + rot_y_b)) * 2) * 2.5
  // calculate rotation in z direction
  const rot_z_y = data[33].y - data[263].y
  const rot_z_d = getDistance(data[33], data[263])
  const rot_z = data[33].x < data[263].x
    ? Math.asin(rot_z_y / rot_z_d)
    : 1 - Math.asin(rot_z_y / rot_z_d) + Math.PI * 0.68
  // calculate face scale
  const scale = getDistance(data[33], data[263]) * 0.007
  // return null of flipped face detections
  if (rot_y > 0.7 || rot_y < -0.7) { return null }
  // return face orientation
  return {
    position: [pos_x * 0.0029, pos_y * 0.0029, pos_z],
    rotation: [rot_x, rot_y, rot_z],
    scale: [scale, scale, scale]
  }
}

// face detector options
const detectorOptions = [
  // detection model
  "MediaPipeFaceMesh",
  // tfjs runtime with single face
  { runtime: 'tfjs', maxFaces: 1 }
]

// face detection options
const detectionOptions = {
  // flip horizontally
  flipHorizontal: false,
  // landmark detection
  predictIrises: false,
  // single face detection
  maxFaces: 1
}

// media request options
const mediaOptions = {
  // enable video
  video: {
    // front facing camera
    facingMode: "user",
    // square shape output
    aspectRatio: 1,
    // dimensions
    width: { ideal: 720 },
    height: { ideal: 720 }
  },
  // disable audio
  audio: false
}

new Vue({
  // app root
  el: "#app",
  // app data
  data: {
    // current screen
    screen: "loading",
    // loading progress
    progress: { value: 0, message: "Loading..." },
    // initial screen data
    initial: { busy: false, error: null },
    // camera data
    camera: { canvas: null, context: null },
    // three data
    three: { render: null, object: new THREE.Object3D() },
    // filter data
    filters: { list: [], current: null, loading: false },
    // face api data
    api: { options: null },
    // video element
    video: document.createElement("video"),
    // model loader
    loader: new THREE.GLTFLoader(),
    // face detection module
    detector: null
  },
  // app methods
  methods: {
    // request camera permission
    enableCamera() {
      // set as busy
      this.initial.busy = true
      // clear previous error
      this.initial.error = null
      // interface delay
      setTimeout(async () => {
        // try request
        try {
          // request user media
          const stream = await navigator.mediaDevices.getUserMedia(mediaOptions)
          // set stream on video element
          this.video.srcObject = stream
        } catch (err) {
          // show request error
          this.initial.error = "Camera request failed"
        }
        // reset busy state
        this.initial.busy = false
        // return if error
        if (this.initial.error) { return }
        // switch to camera screen
        this.screen = "camera"
        // interface delay
        setTimeout(() => {
          // get stream canvas
          const canvas = document.querySelector("#stream")
          // return if no canvas
          if (!canvas) { return }
          // store stream canvas
          this.camera.canvas = canvas
          // get canvas context for frequently reading
          this.camera.context = canvas.getContext("2d", {
            willReadFrequently: true
          })
          // mirror canvas drawing
          this.camera.context.translate(canvas.width, 0)
          this.camera.context.scale(-1, 1)
          // create scene
          const scene = new THREE.Scene()
          // create camera
          const camera = new THREE.OrthographicCamera()
          // create renderer
          const renderer = new THREE.WebGLRenderer({
            // use existing canvas with transparency
            alpha: true, antialias: true, canvas: document.querySelector("#filter")
          })
          // transparent background
          renderer.setClearColor(0x000000, 0)
          // set camera position
          camera.position.set(0, 0, 45)
          // add camera to scene
          scene.add(camera)
          // configure object rotation
          this.three.object.rotation.order = 'ZYX'
          // hide object initially
          this.three.object.visible = false
          // add object to scene
          scene.add(this.three.object)
          // configure renderer color tones
          renderer.outputColorSpace = THREE.SRGBColorSpace
          renderer.toneMapping = THREE.ACESFilmicToneMapping
          renderer.toneMappingExposure = 1.1
          renderer.physicallyCorrectLights = true
          // configure renderer shadow map
          renderer.shadowMap.enabled = true
          renderer.shadowMap.type = THREE.PCFSoftShadowMap
          // add ambient lighting
          scene.add(new THREE.AmbientLight(0xffffff, 0.4))
          // add hemisphere lighting
          scene.add(new THREE.HemisphereLight(0x88ccff, 0x444433, 0.5))
          // add key lighting
          const keyLight = new THREE.DirectionalLight(0xffffff, 1.2)
          keyLight.position.set(5, 10, 7)
          keyLight.castShadow = true
          keyLight.shadow.mapSize.set(2048, 2048)
          keyLight.shadow.camera.near = 0.1
          keyLight.shadow.camera.far = 50
          scene.add(keyLight)
          // add fill lighting
          const fillLight = new THREE.DirectionalLight(0x44aaff, 0.6)
          fillLight.position.set(-5, 5, 5)
          scene.add(fillLight)
          // add rim lighting
          const rimLight = new THREE.DirectionalLight(0xff55aa, 0.8)
          rimLight.position.set(0, 5, -10)
          scene.add(rimLight)
          // add point lighting
          const accentLight = new THREE.PointLight(0xffcc00, 0.4, 10)
          accentLight.position.set(2, 2, 2)
          scene.add(accentLight)
          // add spot lighting
          const spot = new THREE.SpotLight(0xffffff, 0.3, 15, Math.PI / 7, 0.4)
          spot.position.set(0, 6, 4)
          scene.add(spot)
          // store render method
          this.three.render = () => renderer.render(scene, camera)
          // start update loop
          this.updateCamera()
        }, 50)
      }, 200)
    },
    // update camera view
    async updateCamera() {
      // draw video on canvas
      this.camera.context.drawImage(this.video, 0, 0)
      // get face detection results
      const results = await this.detector.estimateFaces(this.camera.canvas, detectionOptions)
      // check for results
      if (results && results.length) {
        // get face orientation
        const orientation = getOrientation(results[0], this.camera.canvas)
        // check output
        if (orientation) {
          // apply orientation to object
          this.three.object.scale.set(...orientation.scale)
          this.three.object.position.set(...orientation.position)
          this.three.object.rotation.set(...orientation.rotation)
          // show object
          this.three.object.visible = true
        } else {
          // hide object
          this.three.object.visible = false
        }
      } else {
        // hide object
        this.three.object.visible = false
      }
      // render three modules
      this.three.render()
      // request animation frame
      requestAnimationFrame(this.updateCamera)
    },
    // load filter model
    loadFilter(filter, progress) {
      // return if loading
      if (this.filters.loading) { return }
      // set as current filter
      this.filters.current = filter
      // set as loading
      this.filters.loading = true
      // get previously loaded model
      const previous = this.three.object.children[1]
      // remove if exists
      if (previous) { this.three.object.remove(previous) }
      // return promise
      return new Promise(resolve => {
        // load filter model
        this.loader.load(`${baseURL}assets/models/filters/${filter.id}.glb`, scene => {
          // get filter model
          const model = scene.scene
          window.m = model
          // set model scale
          if (filter.options.scale) {
            model.scale.set(...Array(3).fill(filter.options.scale))
          }
          // set model position
          if (filter.options.position) {
            model.position.set(...filter.options.position)
          }
          // add into object
          this.three.object.add(model)
          // stop loading
          this.filters.loading = false
          // resolve callback
          resolve(true)
        }, progress, () => resolve(false))
      })
    },
    // open model source page
    openSource() {
      // return if no current filter
      if (!this.filters.current) { return }
      // open source url
      window.open(this.filters.current.source)
    }
  },
  // mounted listener
  async mounted() {
    // load filters list
    this.filters.list = await fetch("index.json").then(resp => resp.json())
    // update progress
    this.progress = { value: 10, message: "Loading assets..." }
    // load occlusion model
    this.loader.load(`${baseURL}assets/models/occlusion.glb`, async scene => {
      // update progress
      this.progress = { value: 40, message: "Loading models..." }
      // get model
      const model = scene.scene
      // update material color
      model.children[0].material = new THREE.MeshBasicMaterial({ color: 'white' })
      // disable color writing
      model.children[0].material.colorWrite = false
      // add to object
      this.three.object.add(model)
      // load first filter
      await this.loadFilter(this.filters.list[0])
      // update progress
      this.progress = { value: 65, message: "Loading face detector..." }
      // load face detector
      this.detector = await faceLandmarksDetection.createDetector(...detectorOptions)
      // configure video element
      this.video.playsInline = true
      this.video.autoplay = true
      this.video.muted = true
      // append on body element
      document.body.appendChild(this.video)
      // update progress
      this.progress = { value: 95, message: "Almost ready..." }
      // show initial screen
      setTimeout(() => this.screen = "initial", 300)
    })
  }
})
