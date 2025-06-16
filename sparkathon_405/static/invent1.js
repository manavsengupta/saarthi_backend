// --- Global Variables for Firebase (if ever needed, though not used here) ---
// These are typically provided by the Canvas environment.
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// --- Three.js Setup ---
let scene, camera, renderer, controls;
const store3DContainer = document.getElementById('store-3d-container');
const loadingSpinner = document.getElementById('loading-spinner');

function initThreeJS() {
    // Scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x003366); // Dark blue for store interior

    // Camera
    camera = new THREE.PerspectiveCamera(75, store3DContainer.clientWidth / store3DContainer.clientHeight, 0.1, 1000);
    camera.position.set(0, 10, 25); // Adjusted camera position for store view

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(store3DContainer.clientWidth, store3DContainer.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio); // Handle high-DPI screens
    store3DContainer.appendChild(renderer.domElement);

    // Hide loading spinner once canvas is appended
    loadingSpinner.style.display = 'none';

    // Controls (OrbitControls for user interaction)
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; // Smooth camera movement
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = false; // Prevent panning relative to screen
    controls.minDistance = 5;
    controls.maxDistance = 60;
    controls.maxPolarAngle = Math.PI / 2 - 0.1; // Limit vertical rotation

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 2.5); // Brighter ambient light for store
    scene.add(ambientLight);

    const spotLight = new THREE.SpotLight(0xffffff, 1.2, 80, Math.PI / 4, 0.5, 2);
    spotLight.position.set(0, 30, 0);
    spotLight.castShadow = true;
    spotLight.shadow.mapSize.width = 1024;
    spotLight.shadow.mapSize.height = 1024;
    spotLight.shadow.camera.near = 1;
    spotLight.shadow.camera.far = 200;
    scene.add(spotLight);

    // Create Walmart Store Model
    createWalmartStoreModel();

    // Resize listener
    window.addEventListener('resize', onWindowResize, false);
    // Start animation loop
    animate();
}

function createWalmartStoreModel() {
    // Store Floor
    const floorGeometry = new THREE.BoxGeometry(50, 0.5, 40);
    const floorMaterial = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.1, roughness: 0.9 }); // Light gray floor
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.position.y = -0.25;
    floor.receiveShadow = true;
    scene.add(floor);

    // Walls
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xe7f0f7, metalness: 0.1, roughness: 0.8 }); // Off-white walls
    // Back wall
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(50, 20, 0.5), wallMaterial);
    backWall.position.set(0, 10, -20.25);
    scene.add(backWall);
    // Side walls
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.5, 20, 40), wallMaterial);
    leftWall.position.set(-25.25, 10, 0);
    scene.add(leftWall);
    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.5, 20, 40), wallMaterial);
    rightWall.position.set(25.25, 10, 0);
    scene.add(rightWall);
    // Front wall (partially open for entrance)
    const frontWallLeft = new THREE.Mesh(new THREE.BoxGeometry(20, 20, 0.5), wallMaterial);
    frontWallLeft.position.set(-15, 10, 20.25);
    scene.add(frontWallLeft);
    const frontWallRight = new THREE.Mesh(new THREE.BoxGeometry(20, 20, 0.5), wallMaterial);
    frontWallRight.position.set(15, 10, 20.25);
    scene.add(frontWallRight);
    const frontWallTop = new THREE.Mesh(new THREE.BoxGeometry(10, 5, 0.5), wallMaterial);
    frontWallTop.position.set(0, 17.5, 20.25); // Top part of the front wall
    scene.add(frontWallTop);


    // Store Shelves (simple rows of boxes)
    const shelfMaterial = new THREE.MeshStandardMaterial({ color: 0x99a9bc, metalness: 0.1, roughness: 0.6 }); // Grayish blue
    const productMaterial = new THREE.MeshStandardMaterial({ color: 0x5bba47, metalness: 0.2, roughness: 0.5 }); // Walmart Green

    for (let z = -15; z <= 10; z += 10) { // Rows along the depth
        for (let x = -20; x <= 20; x += 10) { // Columns along the width
            if (Math.abs(x) < 5 && z === 10) continue; // Skip center front for entrance/checkout
            // Shelf base
            const shelfBase = new THREE.Mesh(new THREE.BoxGeometry(8, 0.5, 2), shelfMaterial);
            shelfBase.position.set(x, 1, z);
            scene.add(shelfBase);

            // Add 'products' on shelves
            for (let h = 1; h <= 3; h++) { // 3 layers of products
                for (let p = -3; p <= 3; p += 2) { // Multiple products per shelf
                    const product = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), productMaterial);
                    product.position.set(x + p * 0.9, 1.5 + h * 1.5, z);
                    scene.add(product);
                }
            }
        }
    }

    // Checkout counters
    const counterMaterial = new THREE.MeshStandardMaterial({ color: 0x007dc6, metalness: 0.2, roughness: 0.5 }); // Walmart blue
    const registerMaterial = new THREE.MeshStandardMaterial({ color: 0x444444 }); // Dark gray
    for (let i = -7; i <= 7; i += 7) {
        const counter = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 1.5), counterMaterial);
        counter.position.set(i, 1.5, 17); // Closer to the front
        scene.add(counter);

        const register = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.5), registerMaterial);
        register.position.set(i + 1, 3.5, 17);
        scene.add(register);
    }

    // Human Figure
    const manGroup = new THREE.Group();
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x6e8a8d }); // Greyish blue
    const headMaterial = new THREE.MeshStandardMaterial({ color: 0xffcc99 }); // Skin tone

    // Body
    const body = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 4, 16), bodyMaterial);
    body.position.y = 2; // Half of height + floor offset
    manGroup.add(body);

    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(1.2, 32, 16), headMaterial);
    head.position.y = 5.2; // Above body
    manGroup.add(head);

    // Position the man inside the store
    manGroup.position.set(10, 0, 10); // Example position
    scene.add(manGroup);

    // Ground Plane (outside the store, if needed for context)
    const groundPlaneGeometry = new THREE.PlaneGeometry(100, 100);
    const groundPlaneMaterial = new THREE.MeshStandardMaterial({ color: 0x367c2b, side: THREE.DoubleSide }); // Green for grass/parking
    const groundPlane = new THREE.Mesh(groundPlaneGeometry, groundPlaneMaterial);
    groundPlane.rotation.x = Math.PI / 2;
    groundPlane.position.y = -0.5;
    groundPlane.receiveShadow = true;
    scene.add(groundPlane);
}

function animate() {
    requestAnimationFrame(animate);
    controls.update(); // Only required if controls.enableDamping or controls.autoRotate are set to true
    renderer.render(scene, camera);
}

function onWindowResize() {
    const width = store3DContainer.clientWidth;
    const height = store3DContainer.clientHeight;
    if (width > 0 && height > 0) { // Ensure dimensions are valid
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
    }
}

// --- Mock Data and UI Logic ---
const currentFootfallSpan = document.getElementById('current-footfall');
const totalProductsSpan = document.getElementById('total-products');
const checkoutQueueSpan = document.getElementById('checkout-queue');
const highDemandCategoriesList = document.getElementById('high-demand-categories');
const lowStockAlertsStoreList = document.getElementById('low-stock-alerts-store');
const refreshStoreDataBtn = document.getElementById('refresh-store-data-btn');

const costRecommendationP = document.getElementById('cost-recommendation');
const deliveryRecommendationP = document.getElementById('delivery-recommendation');
const efficiencyRecommendationP = document.getElementById('efficiency-recommendation');
const stockRecommendationP = document.getElementById('stock-recommendation');

const itemSearchInput = document.getElementById('item-search');
const getRecommendationBtn = document.getElementById('get-recommendation-btn');
const searchResultDiv = document.getElementById('search-result');
const searchedItemSpan = document.getElementById('searched-item');
const itemRecommendationTextP = document.getElementById('item-recommendation-text');

// New elements for map and delivery tips
const warehouseMapCanvas = document.getElementById('warehouse-map-canvas');
const deliveryMapTipP = document.getElementById('delivery-map-tip');
const highlightPathBtn = document.getElementById('highlight-path-btn');
const nextDeliveryTipBtn = document.getElementById('next-delivery-tip-btn');
let mapCtx; // 2D rendering context for the map canvas

const mockStoreData = {
    currentFootfall: 120,
    totalProducts: 25000,
    checkoutQueue: 5,
    highDemand: [
        { name: 'Electronics', type: 'Fast Moving' },
        { name: 'Fresh Produce', type: 'High Volume' },
        { name: 'Packaged Snacks', type: 'Impulse Buy' }
    ],
    lowStock: [
        { name: 'Milk', location: 'Dairy Section' },
        { name: 'Bread', location: 'Bakery' },
        { name: 'Laptop Model X', location: 'Electronics' }
    ]
};

const mockSmartRecommendations = {
    'cost': [
        'Suggest re-ordering <strong class="text-white">"Beverages"</strong> from Supplier A (cost-efficient) due to bulk discount.',
        'Procure <strong class="text-white">"Cleaning Supplies"</strong> in larger batches to reduce per-unit cost by 7%.',
        'Negotiate better terms with <strong class="text-white">"Textile"</strong> suppliers to save 5% on next quarter\'s inventory.'
    ],
    'delivery': [
        'Optimize delivery route for "Perishable Goods" to reduce transit time by <strong class="text-white">15 minutes</strong>, improving freshness.',
        'Consolidate <strong class="text-white">"Small Appliances"</strong> deliveries to Warehouse B to reduce freight costs by 10%.',
        'Prioritize express delivery for <strong class="text-white">"High-Value Electronics"</strong> to meet online order SLAs.'
    ],
    'efficiency': [
        'Re-allocate <strong class="text-white">2 staff</strong> to checkout counters during peak hours (18:00-20:00) to reduce wait times by 30%.',
        'Implement automated inventory scanning in <strong class="text-white">"Grocery Section"</strong> to reduce manual audit time by 50%.',
        'Train <strong class="text-white">1 staff member</strong> on forklift operation to improve stock movement efficiency in the backroom.'
    ],
    'stock': [
        'Replenish <strong class="text-white">"Electronics"</strong> section (Area A) by <strong class="text-white">30%</strong> based on predicted sales spikes for Diwali.',
        'Order <strong class="text-white">500 units</strong> of <strong class="text-white">"Winter Apparel"</strong>; current stock is below safety levels for the upcoming season.',
        'Clear out <strong class="text-white">"Expired Seasonal Decor"</strong> to free up 5% shelf space in Section C.'
    ],
    'delivery_map': [
        {
            tip: 'For faster delivery of "Electronics," pick from <strong class="text-white">Zone A</strong>. Estimated saving: <strong class="text-white">5 minutes</strong> per order.',
            zone: 'A'
        },
        {
            tip: 'Route optimization for "Fresh Produce" suggests picking from <strong class="text-white">Zone B</strong> to exit. Saving: <strong class="text-white">3 minutes</strong>.',
            zone: 'B'
        },
        {
            tip: 'Heavy items from <strong class="text-white">Zone C</strong> should use the West exit for efficiency. Avoid bottleneck at Main.',
            zone: 'C'
        },
        {
            tip: 'Cross-docking items from <strong class="text-white">Zone D</strong> can reduce delivery time by <strong class="text-white">7 minutes</strong>.',
            zone: 'D'
        }
    ],
    'default': 'No specific recommendation for this query. Please try searching for an item, a category, or a specific operational area (e.g., cost, delivery, efficiency, stock, map).'
};

let currentDeliveryTipIndex = 0;

function updateStoreUI(data) {
    currentFootfallSpan.textContent = data.currentFootfall.toLocaleString();
    totalProductsSpan.textContent = data.totalProducts.toLocaleString();
    checkoutQueueSpan.textContent = `${data.checkoutQueue} people`;

    highDemandCategoriesList.innerHTML = '';
    data.highDemand.forEach(item => {
        const li = document.createElement('li');
        li.textContent = `${item.name} (${item.type})`;
        highDemandCategoriesList.appendChild(li);
    });

    lowStockAlertsStoreList.innerHTML = '';
    data.lowStock.forEach(item => {
        const li = document.createElement('li');
        li.textContent = `${item.name} (${item.location})`;
        lowStockAlertsStoreList.appendChild(li);
    });
}

function simulateStoreDataUpdate() {
    const newFootfall = Math.floor(80 + Math.random() * 80); // 80-160
    const newTotalProducts = Math.floor(24000 + Math.random() * 2000); // 24000-26000
    const newCheckoutQueue = Math.floor(Math.random() * 8); // 0-7 people

    const newHighDemand = [...mockStoreData.highDemand];
    if (Math.random() > 0.6) {
        newHighDemand.pop();
        newHighDemand.unshift({ name: 'New Item A', type: 'Trending' });
    }

    const newLowStock = [...mockStoreData.lowStock];
    if (Math.random() > 0.7) {
        newLowStock.pop();
        newLowStock.unshift({ name: 'New Alert B', location: 'Random Section' });
    }

    const updatedData = {
        currentFootfall: newFootfall,
        totalProducts: newTotalProducts,
        checkoutQueue: newCheckoutQueue,
        highDemand: newHighDemand,
        lowStock: newLowStock
    };
    updateStoreUI(updatedData);

    // Update static recommendations with random ones from the mock data
    costRecommendationP.innerHTML = mockSmartRecommendations['cost'][Math.floor(Math.random() * mockSmartRecommendations['cost'].length)];
    deliveryRecommendationP.innerHTML = mockSmartRecommendations['delivery'][Math.floor(Math.random() * mockSmartRecommendations['delivery'].length)];
    efficiencyRecommendationP.innerHTML = mockSmartRecommendations['efficiency'][Math.floor(Math.random() * mockSmartRecommendations['efficiency'].length)];
    stockRecommendationP.innerHTML = mockSmartRecommendations['stock'][Math.floor(Math.random() * mockSmartRecommendations['stock'].length)];

    // Update map tip
    currentDeliveryTipIndex = Math.floor(Math.random() * mockSmartRecommendations['delivery_map'].length);
    deliveryMapTipP.innerHTML = mockSmartRecommendations['delivery_map'][currentDeliveryTipIndex].tip;
    drawWarehouseMap(mockSmartRecommendations['delivery_map'][currentDeliveryTipIndex].zone);


    console.log('Store data refreshed:', updatedData);
}

function getSmartRecommendation(query) {
    const normalizedQuery = query.toLowerCase();
    if (normalizedQuery.includes('cost')) {
        return mockSmartRecommendations['cost'][Math.floor(Math.random() * mockSmartRecommendations['cost'].length)];
    } else if (normalizedQuery.includes('delivery')) {
        return mockSmartRecommendations['delivery'][Math.floor(Math.random() * mockSmartRecommendations['delivery'].length)];
    } else if (normalizedQuery.includes('efficiency') || normalizedQuery.includes('staff')) {
        return mockSmartRecommendations['efficiency'][Math.floor(Math.random() * mockSmartRecommendations['efficiency'].length)];
    } else if (normalizedQuery.includes('stock') || normalizedQuery.includes('replenish') || normalizedQuery.includes('inventory')) {
        return mockSmartRecommendations['stock'][Math.floor(Math.random() * mockSmartRecommendations['stock'].length)];
    } else if (normalizedQuery.includes('map') || normalizedQuery.includes('faster delivery')) {
        const tipData = mockSmartRecommendations['delivery_map'][Math.floor(Math.random() * mockSmartRecommendations['delivery_map'].length)];
        return tipData.tip + ` (Refer to Zone ${tipData.zone} on the map)`;
    } else {
        // General item lookup based on mock data
        for (const key in mockSmartRecommendations) {
            // Check if query loosely matches any of the mock recommendation items
            if (Array.isArray(mockSmartRecommendations[key])) {
                for (const rec of mockSmartRecommendations[key]) {
                    if (typeof rec === 'string' && rec.toLowerCase().includes(normalizedQuery)) {
                        return rec;
                    } else if (typeof rec === 'object' && rec.tip && rec.tip.toLowerCase().includes(normalizedQuery)) {
                        return rec.tip;
                    }
                }
            }
        }
    }
    return mockSmartRecommendations['default'];
}


// --- 2D Warehouse Map Drawing ---
function drawWarehouseMap(highlightZone = null) {
    if (!mapCtx) {
        mapCtx = warehouseMapCanvas.getContext('2d');
    }
    const canvasWidth = warehouseMapCanvas.width;
    const canvasHeight = warehouseMapCanvas.height;

    mapCtx.clearRect(0, 0, canvasWidth, canvasHeight); // Clear canvas
    mapCtx.fillStyle = '#004080'; // Map background color
    mapCtx.fillRect(0, 0, canvasWidth, canvasHeight);

    const zoneSizeX = canvasWidth / 2;
    const zoneSizeY = canvasHeight / 2;

    const zones = {
        'A': { x: 0, y: 0, textX: zoneSizeX / 2, textY: zoneSizeY / 2 },
        'B': { x: zoneSizeX, y: 0, textX: zoneSizeX * 1.5, textY: zoneSizeY / 2 },
        'C': { x: 0, y: zoneSizeY, textX: zoneSizeX / 2, textY: zoneSizeY * 1.5 },
        'D': { x: zoneSizeX, y: zoneSizeY, textX: zoneSizeX * 1.5, textY: zoneSizeY * 1.5 }
    };

    // Draw zones
    mapCtx.strokeStyle = '#007dc6'; // Walmart blue for borders
    mapCtx.lineWidth = 3;
    mapCtx.font = 'bold 24px Inter';
    mapCtx.textAlign = 'center';
    mapCtx.textBaseline = 'middle';

    for (const zoneName in zones) {
        const zone = zones[zoneName];
        mapCtx.beginPath();
        mapCtx.rect(zone.x, zone.y, zoneSizeX, zoneSizeY);
        mapCtx.stroke();

        // Highlight if requested
        if (highlightZone && highlightZone.toUpperCase() === zoneName) {
            mapCtx.fillStyle = 'rgba(255, 255, 0, 0.3)'; // Yellow highlight
            mapCtx.fillRect(zone.x, zone.y, zoneSizeX, zoneSizeY);
        }

        mapCtx.fillStyle = '#e7f0f7'; // Light text for zone labels
        mapCtx.fillText(zoneName, zone.textX, zone.textY);
    }

    // Draw main path (e.g., from center to exit)
    mapCtx.strokeStyle = '#ffc120'; // Walmart yellow for path
    mapCtx.lineWidth = 5;
    mapCtx.setLineDash([10, 5]); // Dashed line for path
    mapCtx.beginPath();
    mapCtx.moveTo(canvasWidth / 2, 0); // Top center (start from A/B boundary)
    mapCtx.lineTo(canvasWidth / 2, canvasHeight - 20); // Down to exit area
    mapCtx.stroke();
    mapCtx.setLineDash([]); // Reset line dash

    // Delivery Exit Point
    mapCtx.fillStyle = '#367c2b'; // Walmart green
    mapCtx.beginPath();
    mapCtx.arc(canvasWidth / 2, canvasHeight - 10, 15, 0, Math.PI * 2);
    mapCtx.fill();
    mapCtx.fillStyle = '#e7f0f7';
    mapCtx.font = 'bold 16px Inter';
    mapCtx.fillText('EXIT', canvasWidth / 2, canvasHeight - 10);

    // Highlight specific paths based on recommendation
    if (highlightZone) {
        const zone = zones[highlightZone.toUpperCase()];
        if (zone) {
            mapCtx.strokeStyle = '#ff0000'; // Red for highlighted path
            mapCtx.lineWidth = 6;
            mapCtx.setLineDash([5, 5]);
            mapCtx.beginPath();
            // Example path: from the center of the highlighted zone to the exit
            mapCtx.moveTo(zone.textX, zone.textY);
            mapCtx.lineTo(canvasWidth / 2, canvasHeight - 10);
            mapCtx.stroke();
            mapCtx.setLineDash([]);
        }
    }
}

// --- Event Listeners ---
refreshStoreDataBtn.addEventListener('click', () => {
    simulateStoreDataUpdate();
});

getRecommendationBtn.addEventListener('click', () => {
    const searchTerm = itemSearchInput.value.trim();
    if (searchTerm) {
        const recommendation = getSmartRecommendation(searchTerm);
        searchedItemSpan.textContent = searchTerm;
        itemRecommendationTextP.innerHTML = recommendation; // Use innerHTML to render strong tags
        searchResultDiv.classList.remove('hidden');

        // If the recommendation is map-related, highlight the zone
        const match = recommendation.match(/Zone ([A-D])/);
        if (match) {
            drawWarehouseMap(match[1]);
        } else {
            drawWarehouseMap(); // Clear highlight if not map-related
        }

    } else {
        searchResultDiv.classList.add('hidden');
        itemRecommendationTextP.textContent = '';
        drawWarehouseMap(); // Clear highlight
    }
});

highlightPathBtn.addEventListener('click', () => {
    const currentZone = mockSmartRecommendations['delivery_map'][currentDeliveryTipIndex].zone;
    drawWarehouseMap(currentZone);
});

nextDeliveryTipBtn.addEventListener('click', () => {
    currentDeliveryTipIndex = (currentDeliveryTipIndex + 1) % mockSmartRecommendations['delivery_map'].length;
    const nextTip = mockSmartRecommendations['delivery_map'][currentDeliveryTipIndex];
    deliveryMapTipP.innerHTML = nextTip.tip;
    drawWarehouseMap(nextTip.zone); // Highlight the zone for the new tip
});


// Initialize UI with mock data on load
document.addEventListener('DOMContentLoaded', () => {
    updateStoreUI(mockStoreData);
    // Initialize static recommendations with initial mock data
    costRecommendationP.innerHTML = mockSmartRecommendations['cost'][0];
    deliveryRecommendationP.innerHTML = mockSmartRecommendations['delivery'][0];
    efficiencyRecommendationP.innerHTML = mockSmartRecommendations['efficiency'][0];
    stockRecommendationP.innerHTML = mockSmartRecommendations['stock'][0];

    // Initialize map and first delivery tip
    if (warehouseMapCanvas.getContext) {
         // Set canvas dimensions for drawing
        warehouseMapCanvas.width = warehouseMapCanvas.offsetWidth;
        warehouseMapCanvas.height = warehouseMapCanvas.offsetHeight;
        mapCtx = warehouseMapCanvas.getContext('2d');
        deliveryMapTipP.innerHTML = mockSmartRecommendations['delivery_map'][currentDeliveryTipIndex].tip;
        drawWarehouseMap(mockSmartRecommendations['delivery_map'][currentDeliveryTipIndex].zone);
    } else {
        deliveryMapTipP.textContent = 'Your browser does not support HTML5 Canvas for map visualization.';
    }

    // Initialize Three.js after the DOM is fully loaded
    initThreeJS();
});

// Ensure canvas redraws on window resize
window.addEventListener('resize', () => {
     // For 2D map canvas
    warehouseMapCanvas.width = warehouseMapCanvas.offsetWidth;
    warehouseMapCanvas.height = warehouseMapCanvas.offsetHeight;
    drawWarehouseMap(mockSmartRecommendations['delivery_map'][currentDeliveryTipIndex].zone);
});
