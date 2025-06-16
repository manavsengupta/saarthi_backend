document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('warehouse3DCanvas');
    if (!canvas) {
        console.error("3D Canvas element not found!");
        return;
    }

    let scene, camera, renderer, cube, controls;

    function initThreeJS() {
        // Scene
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0xf0f0f0); // Light grey background

        // Camera
        camera = new THREE.PerspectiveCamera(75, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
        camera.position.z = 5;
        camera.position.y = 2; // Look down a bit

        // Renderer
        renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
        renderer.setSize(canvas.clientWidth, canvas.clientHeight);
        renderer.setPixelRatio(window.devicePixelRatio);

        // Basic Cube (Placeholder for Warehouse)
        const geometry = new THREE.BoxGeometry(3, 2, 4); // Width, Height, Depth
        const material = new THREE.MeshLambertMaterial({ color: 0x808080 }); // Grey for warehouse
        cube = new THREE.Mesh(geometry, material);
        cube.position.y = 1; // Lift off the ground
        scene.add(cube);

        // Floor
        const floorGeometry = new THREE.PlaneGeometry(10, 10);
        const floorMaterial = new THREE.MeshLambertMaterial({ color: 0xc0c0c0, side: THREE.DoubleSide });
        const floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.rotation.x = Math.PI / 2; // Rotate to be horizontal
        scene.add(floor);

        // Lights
        const ambientLight = new THREE.AmbientLight(0x404040); // Soft white light
        scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8); // White light from a direction
        directionalLight.position.set(5, 5, 5).normalize();
        scene.add(directionalLight);

        // OrbitControls (for user interaction: pan, zoom, rotate)
        // You'll need to include OrbitControls.js if using from CDN or build it
        // For hackathon, you can download it or find a CDN for THREE.OrbitControls.js
        // Example CDN: <script src="https://unpkg.com/three@0.128.0/examples/js/controls/OrbitControls.js"></script>
        // For simplicity, let's assume it's globally available or imported.
        // If you include it via CDN, it usually attaches to THREE.OrbitControls
        controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true; // Smooth camera movement
        controls.dampingFactor = 0.25;
        controls.screenSpacePanning = false;
        controls.maxPolarAngle = Math.PI / 2; // Prevent camera from going below the floor

        // Handle window resize
        window.addEventListener('resize', onWindowResize, false);
    }

    function onWindowResize() {
        camera.aspect = canvas.clientWidth / canvas.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    }

    function animate() {
        requestAnimationFrame(animate);
        controls.update(); // only required if controls.enableDamping is set to true
        renderer.render(scene, camera);
    }

    // Load a more complex GLTF model (requires GLTFLoader)
    // For this, you'll need GLTFLoader.js from Three.js examples
    // <script src="https://unpkg.com/three@0.128.0/examples/js/loaders/GLTFLoader.js"></script>
    function loadWarehouseModel() {
        const loader = new THREE.GLTFLoader();
        loader.load(
            'assets/models/warehouse.gltf', // Path to your 3D model
            function (gltf) {
                // Remove placeholder cube if a model is loaded
                if (cube) {
                    scene.remove(cube);
                }
                scene.add(gltf.scene);
                console.log('Warehouse model loaded successfully!');

                // Optional: Adjust model position/scale if needed
                gltf.scene.scale.set(1, 1, 1); // Adjust scale
                gltf.scene.position.set(0, 0, 0); // Adjust position
            },
            undefined, // onProgress callback (optional)
            function (error) {
                console.error('An error occurred while loading the GLTF model:', error);
                // Fallback to basic cube if model fails to load
                initThreeJS();
                animate();
            }
        );
    }

    // Initialize Three.js
    // For hackathon, if you don't have a GLTF model ready,
    // just use the basic cube by calling initThreeJS() directly.
    // Otherwise, try to load the model.
    try {
        if (typeof THREE.GLTFLoader !== 'undefined') { // Check if GLTFLoader is available
            loadWarehouseModel();
        } else {
            console.warn("GLTFLoader not found. Using basic cube for 3D visualization. Make sure to include GLTFLoader.js if you want to load .gltf models.");
            initThreeJS();
            animate();
        }
    } catch (e) {
        console.error("Error initializing Three.js or loading model:", e);
        initThreeJS(); // Fallback
        animate();
    }
});