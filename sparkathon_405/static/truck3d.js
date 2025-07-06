import * as THREE from 'https://esm.sh/three@0.165.0';
import { OrbitControls } from 'https://esm.sh/three@0.165.0/examples/jsm/controls/OrbitControls';
import { EffectComposer } from 'https://esm.sh/three@0.165.0/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'https://esm.sh/three@0.165.0/examples/jsm/postprocessing/RenderPass';
import { UnrealBloomPass } from 'https://esm.sh/three@0.165.0/examples/jsm/postprocessing/UnrealBloomPass';

let scene, camera, renderer, controls, composer, bloomPass;
let truckInteriorMesh;
const parcels = [];

// For drag and drop functionality
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let draggedObject = null;
let plane = new THREE.Plane();
let offset = new THREE.Vector3();
let intersectionPoint = new THREE.Vector3();

const PRIORITY_COLORS = {
    high: 0xFF4D4D,    // Red
    medium: 0xFFA500,  // Orange
    low: 0x00FFFF     // Bright Cyan (for better neon effect)
};
const HIGHLIGHT_EMISSIVE_FACTOR = 1.5; // Even stronger glow when dragged

// UI elements for responsiveness (Global references)
let hamburgerMenu, mainUIPanel;
let addParcelBtn, clearParcelsBtn; 
let infoSection, addParcelSection; // References to the panel sections

// --- Initialization Function ---
function init() {
    // Get DOM element references
    hamburgerMenu = document.getElementById('hamburger-menu');
    mainUIPanel = document.getElementById('main-ui-panel');
    infoSection = document.getElementById('info-section');
    addParcelSection = document.getElementById('add-parcel-section');

    // Get references to buttons
    addParcelBtn = document.getElementById('addParcelBtn');
    clearParcelsBtn = document.getElementById('clearParcelsBtn');

    // 1. Scene Setup
    scene = new THREE.Scene();
    scene.background = null; // Handled by CSS

    // 2. Camera Setup
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 5, 20);

    // 3. Renderer Setup
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('app-container').appendChild(renderer.domElement);

    // 4. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4); // Brighter ambient light for neon theme
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5); // Stronger directional light
    directionalLight.position.set(10, 15, 10);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 50;
    directionalLight.shadow.camera.left = -20;
    directionalLight.shadow.camera.right = 20;
    directionalLight.shadow.camera.top = 20;
    directionalLight.shadow.camera.bottom = -20;
    scene.add(directionalLight);

    // Ground Plane with Grid Effect
    const groundGeometry = new THREE.PlaneGeometry(100, 100);
    const groundMaterial = new THREE.MeshBasicMaterial({ // Basic material for no shadow/lighting interaction, just color
        color: 0x000000, // Very dark base
        transparent: true,
        opacity: 0.1 // Subtle transparent
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01; // Slightly below truck base to avoid z-fighting
    scene.add(ground);

    // Add grid lines to the ground for visual effect
    const gridHelper = new THREE.GridHelper(100, 100, 0x00FFFF, 0x00FFFF); // Neon Cyan grid
    gridHelper.material.opacity = 0.2; // Subtle grid
    gridHelper.material.transparent = true;
    gridHelper.position.y = 0.0; // Place on the ground
    scene.add(gridHelper);

    // 5. OrbitControls for camera interaction
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = false;
    controls.minDistance = 5;
    controls.maxDistance = 50;
    controls.target.set(0, 2, 0);
    controls.update();

    // 6. Load Truck Interior Model (placeholder with glow)
    loadTruckModel();

    // 7. Post-processing for Bloom Effect
    composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));

    bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 
                                        1.8, // Strength: more bloom for neon theme
                                        0.6, // Radius: wider glow
                                        0.7 // Threshold: allows more elements to glow
    );
    composer.addPass(bloomPass); 

    // 8. Event Listeners for UI buttons
    addParcelBtn.addEventListener('click', addParcel);
    clearParcelsBtn.addEventListener('click', clearParcels);

    // 9. Mouse event listeners for drag and drop
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointerleave', onPointerUp);

    // Hamburger menu toggle for mobile
    hamburgerMenu.addEventListener('click', toggleSidePanel);
    // Close side panel if clicked outside its content area (for mobile)
    document.addEventListener('pointerdown', (event) => {
        if (window.innerWidth < 768 && mainUIPanel.classList.contains('open')) {
            // Check if the click was outside the panel and hamburger menu
            if (!mainUIPanel.contains(event.target) && event.target !== hamburgerMenu) {
                toggleSidePanel();
            }
        }
    });


    // Handle window resizing
    window.addEventListener('resize', onWindowResize, false);
    // Initial call to set correct panel visibility based on current window size
    updatePanelDisplay();

    // Start the animation loop
    animate();
}

// --- Toggle Side Panel Function for Mobile ---
function toggleSidePanel() {
    mainUIPanel.classList.toggle('open');
    // Disable/enable OrbitControls based on panel state
    controls.enabled = !mainUIPanel.classList.contains('open');
}

// --- Update Panel Display based on Screen Size ---
// This function hides/shows the hamburger and panel based on media query
function updatePanelDisplay() {
    if (window.innerWidth < 768) {
        // Mobile view: Show hamburger, ensure panel is hidden initially
        hamburgerMenu.style.display = 'block';
        mainUIPanel.style.display = 'flex'; // Enable flex for vertical layout inside
        // If it was already open, ensure controls are disabled
        if (mainUIPanel.classList.contains('open')) {
            controls.enabled = false;
        } else {
            controls.enabled = true; // Enable controls if panel starts closed
        }
    } else {
        // Desktop view: Hide hamburger, ensure panel is always open
        hamburgerMenu.style.display = 'none';
        mainUIPanel.style.display = 'flex'; // Keep flex display
        mainUIPanel.classList.remove('open'); // Ensure it's not in mobile-open state
        mainUIPanel.style.transform = 'translateX(0)'; // Ensure it's visible on desktop
        controls.enabled = true; // Always enable controls on desktop
    }
}


// --- Load Truck Model Function ---
function loadTruckModel() {
    const truckGeometry = new THREE.BoxGeometry(10, 5, 20);
    const placeholderMaterial = new THREE.MeshStandardMaterial({
        color: 0x111111, // Very dark grey for the main body
        roughness: 0.5,
        metalness: 0.8, // More metallic
        transparent: true,
        opacity: 0.2, // Very subtle transparency
        side: THREE.DoubleSide,
        // Add emissive color for neon outline effect
        emissive: 0x00FFFF, // Neon Cyan glow
        emissiveIntensity: 0.5 // Subtle glow for outline
    });
    truckInteriorMesh = new THREE.Mesh(truckGeometry, placeholderMaterial);
    truckInteriorMesh.receiveShadow = true;
    truckInteriorMesh.castShadow = true; // Truck can also cast shadows
    scene.add(truckInteriorMesh);
    truckInteriorMesh.position.y = truckGeometry.parameters.height / 2;

    // Add subtle inner glowing lines/edges to the truck if desired, e.g.:
    // const edges = new THREE.EdgesGeometry(truckGeometry);
    // const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x00FFFF, linewidth: 2 }));
    // truckInteriorMesh.add(line); // Add lines as children to the truck mesh
}

// --- Add Parcel Function ---
function addParcel() {
    // Get input values directly from the DOM elements
    const width = parseFloat(document.getElementById('parcelWidth').value);
    const height = parseFloat(document.getElementById('parcelHeight').value);
    const depth = parseFloat(document.getElementById('parcelDepth').value);
    const weight = parseFloat(document.getElementById('parcelWeight').value);
    const priority = document.getElementById('parcelPriority').value;

    if (isNaN(width) || isNaN(height) || isNaN(depth) || isNaN(weight) || width <= 0 || height <= 0 || depth <= 0 || weight <= 0) {
        console.warn("Invalid parcel dimensions or weight. Please enter positive numbers for all fields.");
        return;
    }

    const parcelGeometry = new THREE.BoxGeometry(width, height, depth);
    const parcelMaterial = new THREE.MeshStandardMaterial({ 
        color: PRIORITY_COLORS[priority],
        emissive: PRIORITY_COLORS[priority],
        emissiveIntensity: 0.2 // Subtle initial glow for parcels
    });
    const parcel = new THREE.Mesh(parcelGeometry, parcelMaterial);

    parcel.castShadow = true;
    parcel.receiveShadow = true;

    parcel.userData.dimensions = { width, height, depth };
    parcel.userData.weight = weight;
    parcel.userData.priority = priority;
    parcel.userData.originalMaterial = parcelMaterial;

    parcel.rotation.set(0, 0, 0); 

    const truckBounds = new THREE.Box3().setFromObject(truckInteriorMesh);
    const floorY = truckBounds.min.y + height / 2;

    // Place parcels within the truck bounds
    const randX = Math.random() * (truckBounds.max.x - width / 2 - (truckBounds.min.x + width / 2)) + (truckBounds.min.x + width / 2);
    const randZ = Math.random() * (truckBounds.max.z - depth / 2 - (truckBounds.min.z + depth / 2)) + (truckBounds.min.z + depth / 2);

    parcel.position.set(randX, truckBounds.max.y + height * 2, randZ); // Start higher for longer fall
    
    parcel.userData.initialY = parcel.position.y;
    parcel.userData.targetY = floorY;
    parcel.userData.bouncing = true;
    parcel.userData.fallSpeed = 0;
    parcel.userData.bounceFactor = 0.4; // Slightly softer bounce
    parcel.userData.gravity = 0.08; // Slightly stronger gravity for faster fall
    parcel.userData.rotationSpeed = new THREE.Vector3(0, 0, 0); // No rotation during fall
    parcel.userData.landedGlowDuration = 45; // Shorter glow duration
    parcel.userData.landedGlowCounter = 0;

    scene.add(parcel);
    parcels.push(parcel);

    console.log(`Added a ${priority} priority parcel: W:${width} H:${height} D:${depth} Weight:${weight}kg at `, parcel.position);
}

// --- Clear All Parcels Function ---
function clearParcels() {
    parcels.forEach(parcel => scene.remove(parcel));
    parcels.length = 0; 
    console.log("All parcels cleared.");
}

// --- Drag and Drop Logic ---
function onPointerDown(event) {
    // Only allow drag if OrbitControls are enabled (i.e., UI panel is closed on mobile)
    if (!controls.enabled) return;

    if (event.button === 2) {
        return;
    }

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(parcels, false);

    if (intersects.length > 0) {
        draggedObject = intersects[0].object;
        draggedObject.userData.bouncing = false;
        draggedObject.userData.landedGlowCounter = 0;

        if (draggedObject.material && draggedObject.material.color) {
            // Make emissive much stronger for a visible glow during drag
            draggedObject.material.emissive.set(draggedObject.material.color).multiplyScalar(HIGHLIGHT_EMISSIVE_FACTOR);
            draggedObject.material.emissiveIntensity = 2.0; // Higher intensity for pronounced bloom
        }

        controls.enabled = false;
        plane.setFromNormalAndCoplanarPoint(camera.getWorldDirection(new THREE.Vector3()), draggedObject.position);
        
        if (raycaster.ray.intersectPlane(plane, intersectionPoint)) {
            offset.copy(draggedObject.position).sub(intersectionPoint);
        }

        renderer.domElement.style.cursor = 'grabbing';
    }
}

function onPointerMove(event) {
    if (draggedObject) {
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);

        if (raycaster.ray.intersectPlane(plane, intersectionPoint)) {
            draggedObject.position.copy(intersectionPoint).add(offset);

            const truckBounds = new THREE.Box3().setFromObject(truckInteriorMesh);
            const parcelSize = draggedObject.userData.dimensions;

            draggedObject.position.x = Math.max(truckBounds.min.x + parcelSize.width / 2, Math.min(truckBounds.max.x - parcelSize.width / 2, draggedObject.position.x));
            draggedObject.position.y = Math.max(truckBounds.min.y + parcelSize.height / 2, Math.min(truckBounds.max.y - parcelSize.height / 2, draggedObject.position.y));
            draggedObject.position.z = Math.max(truckBounds.min.z + parcelSize.depth / 2, Math.min(truckBounds.max.z - parcelSize.depth / 2, draggedObject.position.z));
        }
    }
}

function onPointerUp(event) {
    if (draggedObject) {
        if (draggedObject.material) {
            // Reset emissive to original subtle glow
            draggedObject.material.emissive.set(PRIORITY_COLORS[draggedObject.userData.priority]);
            draggedObject.material.emissiveIntensity = 0.2; // Back to subtle glow
        }
        draggedObject = null;
        // Only re-enable controls if side panel is not open
        controls.enabled = !mainUIPanel.classList.contains('open');
        renderer.domElement.style.cursor = 'grab';
    }
}

// --- Animation Loop ---
function animate() {
    requestAnimationFrame(animate);

    parcels.forEach(parcel => {
        if (parcel.userData.bouncing) {
            parcel.userData.fallSpeed -= parcel.userData.gravity;
            parcel.position.y += parcel.userData.fallSpeed;
            
            parcel.rotation.x += parcel.userData.rotationSpeed.x;
            parcel.rotation.y += parcel.userData.rotationSpeed.y;
            parcel.rotation.z += parcel.userData.rotationSpeed.z;

            if (parcel.position.y <= parcel.userData.targetY) {
                parcel.position.y = parcel.userData.targetY;
                parcel.userData.fallSpeed *= -parcel.userData.bounceFactor;
                
                if (parcel.userData.landedGlowCounter === 0) {
                    parcel.userData.landedGlowCounter = parcel.userData.landedGlowDuration;
                    parcel.material.emissive.set(PRIORITY_COLORS[parcel.userData.priority]).multiplyScalar(2.0); // Brief bright flash
                    parcel.material.emissiveIntensity = 3.0; // Very high intensity for flash
                }

                if (Math.abs(parcel.userData.fallSpeed) < parcel.userData.gravity * 2 && Math.abs(parcel.position.y - parcel.userData.targetY) < 0.1) {
                    parcel.userData.bouncing = false;
                    parcel.position.y = parcel.userData.targetY;
                    parcel.userData.rotationSpeed.set(0,0,0);
                }
            }
        }

        if (parcel.userData.landedGlowCounter > 0) {
            parcel.userData.landedGlowCounter--;
            const intensityRange = 3.0 - 0.2; // From flash intensity to subtle glow
            const currentIntensity = (parcel.userData.landedGlowCounter / parcel.userData.landedGlowDuration) * intensityRange + 0.2;
            parcel.material.emissiveIntensity = currentIntensity;

            if (parcel.userData.landedGlowCounter === 0) {
                 parcel.material.emissiveIntensity = 0.2; // Settle back to original subtle glow
            }
        }
    });

    if (controls) {
        controls.update(); 
    }
    if (composer) {
        composer.render();
    } else {
        if (renderer && scene && camera) {
            renderer.render(scene, camera);
        }
    }
}

// --- Handle Window Resize ---
function onWindowResize() {
    if (camera && renderer) {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);

        if (composer && bloomPass && bloomPass.uniforms && bloomPass.uniforms.resolution) {
            composer.setSize(window.innerWidth, window.innerHeight);
            bloomPass.uniforms.resolution.value.set(window.innerWidth, window.innerHeight);
        }
    }
    // Update panel visibility on resize to switch between mobile/desktop layouts
    updatePanelDisplay();
}

// Initialize the application after the DOM is fully loaded
document.addEventListener('DOMContentLoaded', init);