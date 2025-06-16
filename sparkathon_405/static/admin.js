import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, addDoc, setDoc, updateDoc, deleteDoc, onSnapshot, collection, query, where, getDocs, serverTimestamp, orderBy } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Global variables for Firebase
let app;
let db;
let auth;
let userId = 'anonymous'; // Default to anonymous
let appId;
let isAuthReady = false;

// Configuration and initialization
window.onload = async function() {
    try {
        // Retrieve appId and firebaseConfig from the environment
        appId = typeof __app_id !== 'undefined' ? __app_id : 'default-saarthi-app';
        const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};

        if (Object.keys(firebaseConfig).length === 0) {
            console.error("Firebase configuration is missing. Please ensure __firebase_config is defined.");
            showMessage('Error', 'Firebase configuration is missing. The app may not function correctly.');
            return;
        }

        app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);

        // Display App ID
        document.getElementById('currentAppId').textContent = appId;

        // Sign in anonymously if no custom token, otherwise use custom token
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
            await signInWithCustomToken(auth, __initial_auth_token);
            console.log("Signed in with custom token.");
        } else {
            await signInAnonymously(auth);
            console.log("Signed in anonymously.");
        }

        // Listen for auth state changes
        onAuthStateChanged(auth, (user) => {
            if (user) {
                userId = user.uid;
                document.getElementById('currentUserId').textContent = userId;
                console.log("Auth state changed. User ID:", userId);
                isAuthReady = true;
                // Once auth is ready, set up real-time listeners
                setupRealtimeListeners();
                // Initialize drone simulation only after auth is ready
                initializeDroneSimulation();
            } else {
                userId = 'anonymous'; // Fallback if no user
                document.getElementById('currentUserId').textContent = userId + ' (not authenticated)';
                console.log("Auth state changed. No user is signed in.");
                isAuthReady = true; // Still mark as ready, even if anonymous
                setupRealtimeListeners();
                initializeDroneSimulation();
            }
        });

        // Set default view to dashboard
        showView('dashboard');
    } catch (error) {
        console.error("Error during Firebase initialization or sign-in:", error);
        showMessage('Initialization Error', `Failed to initialize the application: ${error.message}`);
    }
};

// --- Global State Variables ---
let drones = [];
let orders = [];
let logs = [];
let selectedDroneForCamera = null; // For the camera view
let droneSimulationInterval = null; // To control the simulation loop

// --- Constants for Firestore Collection Paths ---
const getDronesCollection = () => collection(db, `artifacts/${appId}/public/data/drones`);
const getOrdersCollection = () => collection(db, `artifacts/${appId}/public/data/orders`);
const getMissionsCollection = () => collection(db, `artifacts/${appId}/public/data/missions`);
const getLogsCollection = () => collection(db, `artifacts/${appId}/public/data/logs`);

// --- UI Functions ---

// Function to show custom message modal
function showMessage(title, message) {
    document.getElementById('messageModalTitle').textContent = title;
    document.getElementById('messageModalBody').textContent = message;
    document.getElementById('messageModal').style.display = 'flex';
}

// Function to close any modal
function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

// Function to switch between views
function showView(viewId) {
    document.querySelectorAll('.view').forEach(view => {
        view.classList.add('hidden');
    });
    document.getElementById(`${viewId}-view`).classList.remove('hidden');

    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('bg-indigo-100', 'text-indigo-700');
        item.classList.add('text-gray-700');
    });
    document.querySelector(`.nav-item[data-view="${viewId}"]`).classList.add('bg-indigo-100', 'text-indigo-700');

    // Specific actions when certain views are shown
    if (viewId === 'map') {
        drawMap();
    } else if (viewId === 'camera') {
        startCameraSimulation();
    } else {
        stopCameraSimulation();
    }
}

// Toggle mobile navigation
document.getElementById('menuToggle').addEventListener('click', () => {
    document.getElementById('mainNav').classList.toggle('hidden');
});

// Add event listeners for navigation items
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
        const view = e.currentTarget.dataset.view;
        showView(view);
        // Hide mobile nav after selection
        if (window.innerWidth < 768) { // md breakpoint
            document.getElementById('mainNav').classList.add('hidden');
        }
    });
});

// --- Realtime Data Listeners ---
function setupRealtimeListeners() {
    if (!isAuthReady) {
        console.warn("Auth not ready yet, deferring real-time listeners setup.");
        return;
    }

    // Listen for Drone changes
    onSnapshot(getDronesCollection(), (snapshot) => {
        drones = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log("Drones updated:", drones);
        renderDrones();
        updateDashboardCounts();
        drawMap(); // Redraw map on drone updates
        if (selectedDroneForCamera && !drones.some(d => d.id === selectedDroneForCamera.id)) {
            selectedDroneForCamera = null; // Clear if selected drone is removed
            stopCameraSimulation();
            showMessage('Info', 'Selected drone for camera view is no longer available.');
        }
    }, (error) => {
        console.error("Error fetching drones:", error);
        showMessage('Error', `Failed to load drones: ${error.message}`);
    });

    // Listen for Order changes
    onSnapshot(getOrdersCollection(), (snapshot) => {
        orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log("Orders updated:", orders);
        renderOrders();
        updateDashboardCounts();
        drawMap(); // Redraw map on order updates (destinations)
    }, (error) => {
        console.error("Error fetching orders:", error);
        showMessage('Error', `Failed to load orders: ${error.message}`);
    });

    // Listen for Log changes
    onSnapshot(query(getLogsCollection(), orderBy("timestamp", "desc")), (snapshot) => {
        logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log("Logs updated:", logs);
        renderLogs();
    }, (error) => {
        console.error("Error fetching logs:", error);
        showMessage('Error', `Failed to load logs: ${error.message}`);
    });

    // Listen for Mission changes (indirectly updates dashboard via drone status)
    onSnapshot(getMissionsCollection(), (snapshot) => {
        const missions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log("Missions updated:", missions);
        updateDashboardCounts();
    }, (error) => {
        console.error("Error fetching missions:", error);
        showMessage('Error', `Failed to load missions: ${error.message}`);
    });
}


// --- Dashboard & Counts ---
function updateDashboardCounts() {
    document.getElementById('totalDronesCount').textContent = drones.length;
    const activeMissions = orders.filter(o => o.status === 'in-transit' || o.status === 'assigned').length;
    document.getElementById('activeMissionsCount').textContent = activeMissions;
    const pendingOrders = orders.filter(o => o.status === 'pending').length;
    document.getElementById('pendingOrdersCount').textContent = pendingOrders;
}

// --- Logs & Alerts ---
async function addLog(type, message, relatedId = null) {
    if (!isAuthReady) {
        console.warn("Auth not ready, cannot add log.");
        return;
    }
    try {
        await addDoc(getLogsCollection(), {
            timestamp: serverTimestamp(),
            type: type,
            message: message,
            relatedId: relatedId,
            userId: userId // Log which user triggered this (if applicable)
        });
        console.log("Log added:", { type, message });
    } catch (error) {
        console.error("Error adding log:", error);
    }
}

function renderLogs() {
    const logsContainer = document.getElementById('logsContainer');
    const recentLogsContainer = document.getElementById('recentLogsContainer');
    logsContainer.innerHTML = '';
    recentLogsContainer.innerHTML = '';

    if (logs.length === 0) {
        logsContainer.innerHTML = '<p class="text-gray-500 text-center py-4">No logs available yet.</p>';
        recentLogsContainer.innerHTML = '<p class="text-gray-500 text-center py-4">No recent activity yet.</p>';
        return;
    }

    // Sort logs by timestamp (newest first) for display
    const sortedLogs = [...logs].sort((a, b) => (b.timestamp?.toDate() || 0) - (a.timestamp?.toDate() || 0));

    sortedLogs.forEach((log, index) => {
        const date = log.timestamp ? log.timestamp.toDate().toLocaleString() : 'N/A';
        const logItem = `
            <div class="p-4 rounded-lg flex items-start space-x-3 ${log.type === 'error' ? 'bg-red-50 text-red-800 border border-red-200' : log.type === 'warning' ? 'bg-yellow-50 text-yellow-800 border border-yellow-200' : 'bg-gray-50 text-gray-700 border border-gray-200'}">
                <i class="mt-1 ${log.type === 'error' ? 'fas fa-exclamation-triangle' : log.type === 'warning' ? 'fas fa-bell' : 'fas fa-info-circle'} text-lg"></i>
                <div>
                    <p class="font-medium text-sm">${log.message}</p>
                    <p class="text-xs text-gray-500 mt-1">
                        <span class="font-semibold">${log.type.toUpperCase()}</span> - ${date}
                        ${log.relatedId ? ` (ID: ${log.relatedId})` : ''}
                    </p>
                </div>
            </div>
        `;
        logsContainer.innerHTML += logItem;
        if (index < 5) { // Show up to 5 recent logs on dashboard
            recentLogsContainer.innerHTML += logItem;
        }
    });
}


// --- Drone Management ---
document.getElementById('addDroneBtn').addEventListener('click', () => showModal('addDroneModal'));
document.getElementById('addNewDroneBtn').addEventListener('click', () => showModal('addDroneModal'));

function showModal(modalId) {
    document.getElementById(modalId).style.display = 'flex';
}

document.getElementById('addDroneForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const droneName = document.getElementById('droneName').value;
    if (!droneName.trim()) {
        showMessage('Validation Error', 'Drone name cannot be empty.');
        return;
    }

    try {
        // Generate a random initial location within a simulated map boundary
        const initialLocation = {
            lat: parseFloat((Math.random() * 90).toFixed(6)),  // 0-90
            lon: parseFloat((Math.random() * 180).toFixed(6))  // 0-180
        };
        await addDoc(getDronesCollection(), {
            name: droneName,
            battery: 100,
            status: 'idle', // idle, en-route, charging, maintenance
            location: initialLocation,
            currentMissionId: null,
            route: [], // Array of {lat, lon} points for the current mission
            ownerId: userId, // Track who added the drone
            createdAt: serverTimestamp(),
            rerouteEffect: null // New field to handle visual reroute effect
        });
        addLog('info', `New drone '${droneName}' added.`, null);
        closeModal('addDroneModal');
        document.getElementById('addDroneForm').reset();
    } catch (error) {
        console.error("Error adding drone:", error);
        showMessage('Error', `Failed to add drone: ${error.message}`);
    }
});

function renderDrones() {
    const dronesList = document.getElementById('dronesList');
    dronesList.innerHTML = '';
    if (drones.length === 0) {
        dronesList.innerHTML = '<p class="text-gray-500 text-center py-4 col-span-full">No drones available. Add a new drone to get started!</p>';
        return;
    }
    drones.forEach(drone => {
        const statusColor = drone.status === 'en-route' ? 'bg-green-100 text-green-800' :
                            drone.status === 'charging' ? 'bg-yellow-100 text-yellow-800' :
                            drone.status === 'maintenance' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800';
        dronesList.innerHTML += `
            <div class="bg-white p-6 rounded-xl shadow-md border border-gray-200 flex flex-col justify-between">
                <div>
                    <div class="flex items-center justify-between mb-3">
                        <h3 class="text-xl font-semibold text-gray-800">${drone.name}</h3>
                        <span class="text-sm font-medium px-3 py-1 rounded-full ${statusColor}">${drone.status.replace('-', ' ').toUpperCase()}</span>
                    </div>
                    <p class="text-gray-600 mb-2">Battery: <span class="font-bold text-gray-900">${drone.battery}%</span></p>
                    <p class="text-gray-600 mb-2">Location: <span class="font-bold text-gray-900">Lat: ${drone.location.lat.toFixed(2)}, Lon: ${drone.location.lon.toFixed(2)}</span></p>
                    <p class="text-gray-600 mb-4">Mission: <span class="font-bold text-gray-900">${drone.currentMissionId ? drone.currentMissionId : 'None'}</span></p>
                </div>
                <div class="flex flex-wrap gap-2 mt-4">
                    <button onclick="changeDroneStatus('${drone.id}', 'charging')" class="bg-yellow-500 hover:bg-yellow-600 text-white text-sm py-2 px-3 rounded-lg shadow transition duration-300 transform hover:scale-105">Charge</button>
                    <button onclick="changeDroneStatus('${drone.id}', 'maintenance')" class="bg-red-500 hover:bg-red-600 text-white text-sm py-2 px-3 rounded-lg shadow transition duration-300 transform hover:scale-105">Maintenance</button>
                    <button onclick="deleteDrone('${drone.id}')" class="bg-gray-500 hover:bg-gray-600 text-white text-sm py-2 px-3 rounded-lg shadow transition duration-300 transform hover:scale-105">Delete</button>
                    <button onclick="setSelectedCameraDrone('${drone.id}')" class="bg-blue-500 hover:bg-blue-600 text-white text-sm py-2 px-3 rounded-lg shadow transition duration-300 transform hover:scale-105">View Camera</button>
                </div>
            </div>
        `;
    });
}

async function changeDroneStatus(droneId, newStatus) {
    if (!isAuthReady) {
        showMessage('Access Denied', 'Authentication not ready. Please wait.');
        return;
    }
    try {
        const droneRef = doc(getDronesCollection(), droneId);
        await updateDoc(droneRef, { status: newStatus });
        addLog('info', `Drone ${droneId} status changed to ${newStatus}.`, droneId);
    } catch (error) {
        console.error("Error updating drone status:", error);
        showMessage('Error', `Failed to update drone status: ${error.message}`);
    }
}

async function deleteDrone(droneId) {
    if (!isAuthReady) {
        showMessage('Access Denied', 'Authentication not ready. Please wait.');
        return;
    }
    try {
        // Before deleting, check if it's assigned to any active mission/order
        const assignedOrder = orders.find(o => o.assignedDroneId === droneId && (o.status === 'assigned' || o.status === 'in-transit'));
        if (assignedOrder) {
            showMessage('Cannot Delete', `Drone ${droneId} is currently assigned to order ${assignedOrder.id}. Please unassign or complete the order first.`);
            return;
        }
        await deleteDoc(doc(getDronesCollection(), droneId));
        addLog('warning', `Drone ${droneId} has been deleted.`, droneId);
    } catch (error) {
        console.error("Error deleting drone:", error);
        showMessage('Error', `Failed to delete drone: ${error.message}`);
    }
}

// --- Order Management ---
document.getElementById('createOrderBtn').addEventListener('click', () => showModal('createOrderModal'));
document.getElementById('addOrderBtn').addEventListener('click', () => showModal('createOrderModal'));

document.getElementById('createOrderForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const customerName = document.getElementById('customerName').value;
    const pickupAddress = document.getElementById('pickupAddress').value;
    const deliveryAddress = document.getElementById('deliveryAddress').value;

    if (!customerName || !pickupAddress || !deliveryAddress) {
        showMessage('Validation Error', 'All order fields are required.');
        return;
    }

    // Simulate random coordinates for pickup and delivery
    const pickupLocation = {
        lat: parseFloat((Math.random() * 90).toFixed(6)),
        lon: parseFloat((Math.random() * 180).toFixed(6)),
        address: pickupAddress
    };
    const deliveryLocation = {
        lat: parseFloat((Math.random() * 90).toFixed(6)),
        lon: parseFloat((Math.random() * 180).toFixed(6)),
        address: deliveryAddress
    };

    try {
        await addDoc(getOrdersCollection(), {
            customerName: customerName,
            pickupLocation: pickupLocation,
            deliveryLocation: deliveryLocation,
            status: 'pending', // pending, assigned, in-transit, delivered, cancelled
            assignedDroneId: null,
            createdAt: serverTimestamp(),
            ownerId: userId // Track who created the order
        });
        addLog('info', `New order created for ${customerName}.`, null);
        closeModal('createOrderModal');
        document.getElementById('createOrderForm').reset();
    } catch (error) {
        console.error("Error creating order:", error);
        showMessage('Error', `Failed to create order: ${error.message}`);
    }
});

function renderOrders() {
    const ordersList = document.getElementById('ordersList');
    ordersList.innerHTML = '';
    if (orders.length === 0) {
        ordersList.innerHTML = '<p class="text-gray-500 text-center py-4 col-span-full">No orders available. Create a new order to get started!</p>';
        return;
    }

    orders.forEach(order => {
        const statusColor = order.status === 'in-transit' ? 'bg-blue-100 text-blue-800' :
                            order.status === 'delivered' ? 'bg-green-100 text-green-800' :
                            order.status === 'cancelled' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800';
        ordersList.innerHTML += `
            <div class="bg-white p-6 rounded-xl shadow-md border border-gray-200">
                <div class="flex items-center justify-between mb-3">
                    <h3 class="text-xl font-semibold text-gray-800">Order #${order.id.substring(0, 8)}</h3>
                    <span class="text-sm font-medium px-3 py-1 rounded-full ${statusColor}">${order.status.replace('-', ' ').toUpperCase()}</span>
                </div>
                <p class="text-gray-600 mb-2">Customer: <span class="font-bold text-gray-900">${order.customerName}</span></p>
                <p class="text-gray-600 mb-2">Pickup: <span class="font-bold text-gray-900">${order.pickupLocation.address}</span></p>
                <p class="text-gray-600 mb-2">Delivery: <span class="font-bold text-gray-900">${order.deliveryLocation.address}</span></p>
                <p class="text-gray-600 mb-4">Assigned Drone: <span class="font-bold text-gray-900">${order.assignedDroneId ? drones.find(d => d.id === order.assignedDroneId)?.name || order.assignedDroneId.substring(0, 8) : 'None'}</span></p>
                <div class="flex flex-wrap gap-2 mt-4">
                    ${order.status === 'pending' ?
                        `<button onclick="prepareAssignOrder('${order.id}')" class="bg-indigo-600 hover:bg-indigo-700 text-white text-sm py-2 px-3 rounded-lg shadow transition duration-300 transform hover:scale-105">Assign Drone</button>` : ''}
                    ${order.status === 'in-transit' ?
                        `<button onclick="completeOrder('${order.id}')" class="bg-green-600 hover:bg-green-700 text-white text-sm py-2 px-3 rounded-lg shadow transition duration-300 transform hover:scale-105">Complete</button>` : ''}
                    ${order.status === 'assigned' || order.status === 'in-transit' ?
                        `<button onclick="cancelOrder('${order.id}')" class="bg-red-600 hover:bg-red-600 text-white text-sm py-2 px-3 rounded-lg shadow transition duration-300 transform hover:scale-105">Cancel</button>` : ''}
                    ${order.status !== 'in-transit' && order.status !== 'assigned' ?
                        `<button onclick="deleteOrder('${order.id}')" class="bg-gray-500 hover:bg-gray-600 text-white text-sm py-2 px-3 rounded-lg shadow transition duration-300 transform hover:scale-105">Delete</button>` : ''}
                </div>
            </div>
        `;
    });
}

function prepareAssignOrder(orderId) {
    const order = orders.find(o => o.id === orderId);
    if (!order) {
        showMessage('Error', 'Order not found.');
        return;
    }

    document.getElementById('assignOrderId').value = orderId;
    document.getElementById('assignOrderDetails').textContent = `Assigning Order #${orderId.substring(0, 8)} (Customer: ${order.customerName}) from ${order.pickupLocation.address} to ${order.deliveryLocation.address}.`;

    const availableDronesSelect = document.getElementById('availableDrones');
    availableDronesSelect.innerHTML = '<option value="">-- Select an available drone --</option>';

    const idleDrones = drones.filter(d => d.status === 'idle' || d.status === 'charging');
    if (idleDrones.length === 0) {
        showMessage('No Drones Available', 'There are no idle or charging drones to assign this order to. Please add a new drone or wait for one to become available.');
        return;
    }

    idleDrones.forEach(drone => {
        const option = document.createElement('option');
        option.value = drone.id;
        option.textContent = `${drone.name} (Battery: ${drone.battery}%)`;
        availableDronesSelect.appendChild(option);
    });

    showModal('assignOrderModal');
}

document.getElementById('assignOrderForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const orderId = document.getElementById('assignOrderId').value;
    const droneId = document.getElementById('availableDrones').value;

    if (!droneId) {
        showMessage('Validation Error', 'Please select a drone.');
        return;
    }
    if (!isAuthReady) {
        showMessage('Access Denied', 'Authentication not ready. Please wait.');
        return;
    }

    const order = orders.find(o => o.id === orderId);
    const drone = drones.find(d => d.id === droneId);

    if (!order || !drone) {
        showMessage('Error', 'Order or Drone not found.');
        return;
    }
    if (drone.status !== 'idle' && drone.status !== 'charging') {
         showMessage('Drone Not Available', `Drone ${drone.name} is not idle or charging and cannot be assigned.`);
         return;
     }

    try {
        // 1. Update Order status and assignedDroneId
        await updateDoc(doc(getOrdersCollection(), orderId), {
            status: 'assigned',
            assignedDroneId: droneId
        });

        // 2. Update Drone status and currentMissionId
        // For simplicity, we'll create a mission ID derived from order ID
        const missionId = `mission_${orderId}`;
        const route = [
            { lat: order.pickupLocation.lat, lon: order.pickupLocation.lon, name: 'Pickup' },
            { lat: order.deliveryLocation.lat, lon: order.deliveryLocation.lon, name: 'Delivery' }
        ];
        await updateDoc(doc(getDronesCollection(), droneId), {
            status: 'en-route',
            currentMissionId: missionId,
            route: route, // Assign the route for simulation
            location: { lat: order.pickupLocation.lat, lon: order.pickupLocation.lon } // Start at pickup
        });

        // 3. Create a new Mission record
        await setDoc(doc(getMissionsCollection(), missionId), { // Use setDoc to create with specific ID
            orderId: orderId,
            droneId: droneId,
            status: 'active', // active, completed, failed
            startTime: serverTimestamp(),
            route: route,
            currentWaypointIndex: 0 // Index of the next waypoint to reach
        });

        addLog('info', `Order ${orderId.substring(0, 8)} assigned to drone ${drone.name}.`, orderId);
        closeModal('assignOrderModal');
    } catch (error) {
        console.error("Error assigning order:", error);
        showMessage('Error', `Failed to assign order: ${error.message}`);
    }
});

async function completeOrder(orderId) {
    if (!isAuthReady) {
        showMessage('Access Denied', 'Authentication not ready. Please wait.');
        return;
    }
    const order = orders.find(o => o.id === orderId);
    if (!order || order.status !== 'in-transit') {
        showMessage('Error', 'Order is not in transit or not found.');
        return;
    }
    try {
        // 1. Update Order status
        await updateDoc(doc(getOrdersCollection(), orderId), {
            status: 'delivered',
            deliveredAt: serverTimestamp()
        });

        // 2. Update Drone status (make it idle, clear mission)
        if (order.assignedDroneId) {
            await updateDoc(doc(getDronesCollection(), order.assignedDroneId), {
                status: 'idle',
                currentMissionId: null,
                route: []
            });
        }

        // 3. Update Mission status
        const missionId = `mission_${order.id}`;
        await updateDoc(doc(getMissionsCollection(), missionId), {
            status: 'completed',
            endTime: serverTimestamp()
        });

        addLog('info', `Order ${orderId.substring(0, 8)} marked as delivered.`, orderId);
    } catch (error) {
        console.error("Error completing order:", error);
        showMessage('Error', `Failed to complete order: ${error.message}`);
    }
}

async function cancelOrder(orderId) {
    if (!isAuthReady) {
        showMessage('Access Denied', 'Authentication not ready. Please wait.');
        return;
    }
    const order = orders.find(o => o.id === orderId);
    if (!order || (order.status !== 'assigned' && order.status !== 'in-transit')) {
        showMessage('Error', 'Order cannot be cancelled in its current state or not found.');
        return;
    }

    try {
        // 1. Update Order status
        await updateDoc(doc(getOrdersCollection(), orderId), {
            status: 'cancelled',
            cancelledAt: serverTimestamp()
        });

        // 2. Update Drone status (make it idle, clear mission)
        if (order.assignedDroneId) {
            await updateDoc(doc(getDronesCollection(), order.assignedDroneId), {
                status: 'idle',
                currentMissionId: null,
                route: []
            });
        }

        // 3. Update Mission status (if exists)
        const missionId = `mission_${order.id}`;
        const missionRef = doc(getMissionsCollection(), missionId);
        const missionSnap = await getDoc(missionRef);
        if (missionSnap.exists()) {
            await updateDoc(missionRef, {
                status: 'failed',
                endTime: serverTimestamp(),
                failureReason: 'Cancelled by admin'
            });
        }

        addLog('warning', `Order ${orderId.substring(0, 8)} has been cancelled.`, orderId);
    } catch (error) {
        console.error("Error cancelling order:", error);
        showMessage('Error', `Failed to cancel order: ${error.message}`);
    }
}

async function deleteOrder(orderId) {
    if (!isAuthReady) {
        showMessage('Access Denied', 'Authentication not ready. Please wait.');
        return;
    }
    const order = orders.find(o => o.id === orderId);
    if (!order || order.status === 'in-transit' || order.status === 'assigned') {
        showMessage('Cannot Delete', 'Order cannot be deleted if it is assigned or in transit.');
        return;
    }
    try {
        await deleteDoc(doc(getOrdersCollection(), orderId));
        addLog('info', `Order ${orderId.substring(0, 8)} has been deleted.`, orderId);
    } catch (error) {
        console.error("Error deleting order:", error);
        showMessage('Error', `Failed to delete order: ${error.message}`);
    }
}

// --- Drone Simulation Logic ---
const SIM_INTERVAL = 1000; // Update every 1 second
const MOVE_SPEED = 0.05; // Degrees per second (simulated)
const BATTERY_DRAIN_PER_SEC = 0.1; // Percentage per second

function initializeDroneSimulation() {
    if (droneSimulationInterval) {
        clearInterval(droneSimulationInterval);
    }
    droneSimulationInterval = setInterval(simulateDrones, SIM_INTERVAL);
    console.log("Drone simulation initialized.");
}

async function simulateDrones() {
    if (!isAuthReady) return; // Don't simulate if auth is not ready

    const dronesToUpdate = [];
    for (const drone of drones) {
        // Clear reroute effect after a few seconds
        if (drone.rerouteEffect && (Date.now() - drone.rerouteEffect.timestamp > 5000)) { // 5 seconds
            dronesToUpdate.push({ id: drone.id, rerouteEffect: null });
        }

        if (drone.status === 'en-route' && drone.currentMissionId && drone.route && drone.route.length > 0) {
            const missionId = drone.currentMissionId;
            const missionDoc = await getDoc(doc(getMissionsCollection(), missionId));
            if (!missionDoc.exists()) {
                console.warn(`Mission ${missionId} for drone ${drone.id} not found.`);
                dronesToUpdate.push({
                    id: drone.id,
                    status: 'idle',
                    currentMissionId: null,
                    route: [],
                    battery: Math.max(0, drone.battery - BATTERY_DRAIN_PER_SEC)
                });
                continue;
            }
            const mission = missionDoc.data();
            let currentWaypointIndex = mission.currentWaypointIndex || 0;

            if (currentWaypointIndex >= drone.route.length) {
                // Drone has reached final destination of its current route
                dronesToUpdate.push({
                    id: drone.id,
                    status: 'idle',
                    currentMissionId: null,
                    route: [],
                    battery: Math.max(0, drone.battery - BATTERY_DRAIN_PER_SEC),
                    location: drone.route[drone.route.length - 1] // Ensure it's exactly at destination
                });
                // Update associated order/mission to delivered/completed
                const order = orders.find(o => o.id === mission.orderId);
                if (order && order.status === 'in-transit') {
                    await completeOrder(order.id);
                }
                await updateDoc(doc(getMissionsCollection(), missionId), { status: 'completed', endTime: serverTimestamp() });
                addLog('info', `Drone ${drone.name} completed mission ${missionId.substring(0, 8)}.`, drone.id);
                continue; // Skip further movement for this drone
            }

            const targetWaypoint = drone.route[currentWaypointIndex];
            let { lat: currentLat, lon: currentLon } = drone.location;
            const { lat: targetLat, lon: targetLon } = targetWaypoint;

            const distanceLat = targetLat - currentLat;
            const distanceLon = targetLon - currentLon;
            const totalDistance = Math.sqrt(distanceLat * distanceLat + distanceLon * distanceLon);

            if (totalDistance < MOVE_SPEED) { // Close enough to reach waypoint
                currentLat = targetLat;
                currentLon = targetLon;
                // No need to update mission.currentWaypointIndex here as it's done below after increment
                addLog('info', `Drone ${drone.name} reached waypoint ${currentWaypointIndex + 1} for mission ${missionId.substring(0,8)}.`, drone.id);
                // If it's the pickup point, change order status to in-transit
                if (currentWaypointIndex === 0 && mission.route[0].name === 'Pickup') { // First waypoint reached is pickup
                     const order = orders.find(o => o.id === mission.orderId);
                     if (order && order.status === 'assigned') {
                         await updateDoc(doc(getOrdersCollection(), order.id), { status: 'in-transit' });
                         addLog('info', `Order ${order.id.substring(0,8)} now in transit with drone ${drone.name}.`, order.id);
                     }
                }
                currentWaypointIndex++; // Increment for the next loop
                // Update the mission in Firestore to reflect the new currentWaypointIndex
                await updateDoc(doc(getMissionsCollection(), missionId), { currentWaypointIndex: currentWaypointIndex });

            } else {
                const angle = Math.atan2(distanceLat, distanceLon);
                currentLat += Math.sin(angle) * MOVE_SPEED;
                currentLon += Math.cos(angle) * MOVE_SPEED;
            }

            dronesToUpdate.push({
                id: drone.id,
                location: { lat: parseFloat(currentLat.toFixed(6)), lon: parseFloat(currentLon.toFixed(6)) },
                battery: Math.max(0, drone.battery - BATTERY_DRAIN_PER_SEC) // Drain battery
            });

            // Check for low battery alert
            if (drone.battery <= 20 && drone.battery > 0 && !drone.lowBatteryAlertSent) {
                addLog('alert', `Drone ${drone.name} battery is low (${drone.battery.toFixed(0)}%).`, drone.id);
                await updateDoc(doc(getDronesCollection(), drone.id), { lowBatteryAlertSent: true });
            } else if (drone.battery > 20 && drone.lowBatteryAlertSent) {
                await updateDoc(doc(getDronesCollection(), drone.id), { lowBatteryAlertSent: false }); // Reset alert if charged
            }
             if (drone.battery <= 0 && drone.status === 'en-route') {
                 addLog('error', `Drone ${drone.name} ran out of battery while en-route!`, drone.id);
                 dronesToUpdate.push({
                     id: drone.id,
                     status: 'maintenance', // Force maintenance
                     currentMissionId: null,
                     route: []
                 });
                 // Mark associated order/mission as failed
                 const order = orders.find(o => o.id === mission.orderId);
                 if (order && (order.status === 'assigned' || order.status === 'in-transit')) {
                     await updateDoc(doc(getOrdersCollection(), order.id), { status: 'cancelled' }); // Or 'failed'
                     addLog('error', `Order ${order.id.substring(0,8)} cancelled due to drone battery failure.`, order.id);
                 }
                 await updateDoc(doc(getMissionsCollection(), missionId), { status: 'failed', endTime: serverTimestamp(), failureReason: 'Battery depleted' });
             }

        } else if (drone.status === 'charging' && drone.battery < 100) {
            dronesToUpdate.push({
                id: drone.id,
                battery: Math.min(100, drone.battery + 0.5) // Charge faster
            });
        } else if (drone.status === 'charging' && drone.battery >= 100) {
            dronesToUpdate.push({
                id: drone.id,
                status: 'idle' // Fully charged, back to idle
            });
            addLog('info', `Drone ${drone.name} is fully charged and idle.`, drone.id);
        }
    }

    // Batch update drones for efficiency
    if (dronesToUpdate.length > 0) {
        const batch = db.batch();
        dronesToUpdate.forEach(update => {
            const droneRef = doc(getDronesCollection(), update.id);
            batch.update(droneRef, update);
        });
        await batch.commit();
    }
}

// --- Dynamic Routing Features ---
document.getElementById('openRerouteModalBtn').addEventListener('click', () => {
    if (!isAuthReady) {
        showMessage('Access Denied', 'Authentication not ready. Please wait.');
        return;
    }
    const rerouteDroneSelect = document.getElementById('rerouteDroneSelect');
    rerouteDroneSelect.innerHTML = '<option value="">-- Select an active drone --</option>';

    const activeDrones = drones.filter(d => d.status === 'en-route');
    if (activeDrones.length === 0) {
        showMessage('No Active Drones', 'There are no drones currently en-route to reroute.');
        return;
    }

    activeDrones.forEach(drone => {
        const option = document.createElement('option');
        option.value = drone.id;
        option.textContent = `${drone.name} (Mission: ${drone.currentMissionId ? drone.currentMissionId.substring(0, 8) : 'N/A'})`;
        rerouteDroneSelect.appendChild(option);
    });
    showModal('rerouteDroneModal');
});

document.getElementById('rerouteDroneForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const droneId = document.getElementById('rerouteDroneSelect').value;
    const reason = document.getElementById('rerouteReasonSelect').value;

    if (!droneId || !reason) {
        showMessage('Validation Error', 'Please select a drone and a reroute reason.');
        return;
    }

    await triggerReroute(droneId, reason);
    closeModal('rerouteDroneModal');
    document.getElementById('rerouteDroneForm').reset();
});

async function triggerReroute(droneId, reason) {
    if (!isAuthReady) {
        showMessage('Access Denied', 'Authentication not ready. Please wait.');
        return;
    }
    const drone = drones.find(d => d.id === droneId);
    if (!drone || drone.status !== 'en-route' || !drone.currentMissionId) {
        showMessage('Error', `Drone ${drone?.name || droneId} is not active or has no current mission to reroute.`);
        return;
    }

    const missionId = drone.currentMissionId;
    const missionRef = doc(getMissionsCollection(), missionId);
    const missionSnap = await getDoc(missionRef);
    if (!missionSnap.exists()) {
        showMessage('Error', `Mission ${missionId} not found for rerouting.`);
        return;
    }

    const mission = missionSnap.data();
    const currentRoute = mission.route;
    const currentWaypointIndex = mission.currentWaypointIndex || 0;

    if (currentRoute.length - 1 <= currentWaypointIndex) {
         showMessage('No Further Route', `Drone ${drone.name} is already at its final waypoint or destination, cannot reroute.`);
         return;
    }

    let detourLat, detourLon, rerouteMessage;
    const currentLat = drone.location.lat;
    const currentLon = drone.location.lon;

    // Generate detour based on reason
    switch (reason) {
        case 'traffic':
            detourLat = currentLat + (Math.random() * 0.2 - 0.1); // Larger offset
            detourLon = currentLon + (Math.random() * 0.2 - 0.1);
            rerouteMessage = `Dynamic rerouting due to heavy traffic detected.`;
            break;
        case 'accident':
            detourLat = currentLat + (Math.random() * 0.3 - 0.15); // Even larger offset
            detourLon = currentLon + (Math.random() * 0.3 - 0.15);
            rerouteMessage = `Emergency rerouting due to an accident on the route.`;
            break;
        case 'new_order_priority':
            detourLat = currentLat + (Math.random() * 0.1 - 0.05);
            detourLon = currentLon + (Math.random() * 0.1 - 0.05);
            rerouteMessage = `Optimizing route for new high-priority order.`;
            break;
        case 'weather':
            detourLat = currentLat + (Math.random() * 0.25 - 0.125);
            detourLon = currentLon + (Math.random() * 0.25 - 0.125);
            rerouteMessage = `Rerouting due to adverse weather conditions.`;
            break;
        case 'obstacle_avoidance':
            detourLat = currentLat + (Math.random() * 0.08 - 0.04); // Smaller, immediate dodge
            detourLon = currentLon + (Math.random() * 0.08 - 0.04);
            rerouteMessage = `Immediate rerouting for obstacle avoidance.`;
            break;
        default:
            detourLat = currentLat + (Math.random() * 0.1 - 0.05);
            detourLon = currentLon + (Math.random() * 0.1 - 0.05);
            rerouteMessage = `Dynamic rerouting due to an unforeseen event.`;
            break;
    }

    // Construct new route: current position -> new detour point -> rest of original route
    const newRoute = [
        { lat: currentLat, lon: currentLon, name: 'Current Location' },
        { lat: parseFloat(detourLat.toFixed(6)), lon: parseFloat(detourLon.toFixed(6)), name: `Detour (${reason})` },
        ...currentRoute.slice(currentWaypointIndex + 1) // Add remaining original waypoints *after* the current one
    ];

    try {
        // Update drone's route and set a temporary reroute effect
        await updateDoc(doc(getDronesCollection(), droneId), {
            route: newRoute,
            rerouteEffect: { active: true, timestamp: Date.now(), reason: reason } // Mark for visual effect
        });
        // Reset mission's currentWaypointIndex to 0 for the *new* route which starts from current location
        await updateDoc(missionRef, {
            route: newRoute,
            currentWaypointIndex: 0
        });
        addLog('alert', `${rerouteMessage} Drone: ${drone.name}.`, droneId);
        showMessage('Reroute Activated!', `${rerouteMessage} Drone: ${drone.name}. See updated path on Live Map.`);
    } catch (error) {
        console.error("Error triggering reroute:", error);
        showMessage('Error', `Failed to reroute drone: ${error.message}`);
    }
}


// --- Live Map Visualization ---
const mapCanvas = document.getElementById('mapCanvas');
const mapCtx = mapCanvas.getContext('2d');
const MAP_SCALE = 5; // Adjust this to fit your simulated coordinates (e.g., 0-90, 0-180)
let mapWidth, mapHeight;

function resizeMapCanvas() {
    mapWidth = mapCanvas.offsetWidth;
    mapHeight = mapCanvas.offsetHeight;
    mapCanvas.width = mapWidth;
    mapCanvas.height = mapHeight;
    drawMap(); // Redraw map after resizing
}

window.addEventListener('resize', () => {
    if (!document.getElementById('map-view').classList.contains('hidden')) {
        resizeMapCanvas();
    }
});

function drawMap() {
    if (mapCanvas.classList.contains('hidden')) return; // Don't draw if map view is hidden

    mapWidth = mapCanvas.offsetWidth;
    mapHeight = mapCanvas.offsetHeight;
    mapCanvas.width = mapWidth;
    mapCanvas.height = mapHeight;

    mapCtx.clearRect(0, 0, mapWidth, mapHeight);

    // Draw a grid for a conceptual map
    mapCtx.strokeStyle = '#e2e8f0';
    mapCtx.lineWidth = 0.5;
    for (let i = 0; i < mapWidth; i += mapWidth / 10) {
        mapCtx.beginPath();
        mapCtx.moveTo(i, 0);
        mapCtx.lineTo(i, mapHeight);
        mapCtx.stroke();
    }
    for (let i = 0; i < mapHeight; i += mapHeight / 10) {
        mapCtx.beginPath();
        mapCtx.moveTo(0, i);
        mapCtx.lineTo(mapWidth, i);
        mapCtx.stroke();
    }

    // Convert simulated lat/lon to canvas coordinates
    // Assuming lat 0-90 maps to 0-height, lon 0-180 maps to 0-width
    function toCanvasX(lon) {
        return (lon / 180) * mapWidth;
    }
    function toCanvasY(lat) {
        return mapHeight - (lat / 90) * mapHeight; // Invert Y for map
    }

    // Draw Orders (Destinations)
    orders.forEach(order => {
        if (order.status !== 'delivered' && order.status !== 'cancelled') {
            const x = toCanvasX(order.deliveryLocation.lon);
            const y = toCanvasY(order.deliveryLocation.lat);
            mapCtx.beginPath();
            mapCtx.arc(x, y, 7, 0, Math.PI * 2); // Destination circle
            mapCtx.fillStyle = '#ef4444'; // Red
            mapCtx.fill();
            mapCtx.strokeStyle = '#b91c1c';
            mapCtx.lineWidth = 2;
            mapCtx.stroke();

            // Label destination
            mapCtx.font = '10px Inter';
            mapCtx.fillStyle = '#6b7280';
            mapCtx.textAlign = 'start'; // Align text to start
            mapCtx.textBaseline = 'alphabetic'; // Default baseline
            mapCtx.fillText(`Order ${order.id.substring(0, 4)}`, x + 10, y - 10);

            // Draw pickup if pending/assigned
            if (order.status === 'pending' || order.status === 'assigned') {
                const px = toCanvasX(order.pickupLocation.lon);
                const py = toCanvasY(order.pickupLocation.lat);
                mapCtx.beginPath();
                mapCtx.rect(px - 5, py - 5, 10, 10); // Pickup square
                mapCtx.fillStyle = '#3b82f6'; // Blue
                mapCtx.fill();
                mapCtx.strokeStyle = '#1d4ed8';
                mapCtx.lineWidth = 1;
                mapCtx.stroke();
                mapCtx.fillText(`Pickup`, px + 10, py + 15);
            }
        }
    });

    // Draw Drones and their routes
    drones.forEach(drone => {
        const x = toCanvasX(drone.location.lon);
        const y = toCanvasY(drone.location.lat);

        // Determine drone color and route style based on status and reroute effect
        let droneFillColor = drone.status === 'en-route' ? '#10b981' : // Green for en-route
                             drone.status === 'charging' ? '#f59e0b' : // Orange for charging
                             drone.status === 'maintenance' ? '#ef4444' : // Red for maintenance
                             '#3b82f6'; // Blue for idle
        let droneStrokeColor = '#1e3a8a';
        let routeStrokeStyle = '#9ca3af'; // Gray for route
        let routeLineWidth = 1;
        let routeLineDash = [];

        if (drone.rerouteEffect && drone.rerouteEffect.active) {
            // Flash purple color for rerouted drone
            droneFillColor = '#8b5cf6'; // Purple
            droneStrokeColor = '#6d28d9';
            routeStrokeStyle = '#8b5cf6'; // Purple route
            routeLineWidth = 2; // Thicker route
            routeLineDash = [2, 2]; // Denser dashes
        }


        // Draw route if available
        if (drone.route && drone.route.length > 0) {
            mapCtx.beginPath();
            mapCtx.moveTo(x, y); // Start from current drone position
            // Draw up to the next 5 waypoints, or all if fewer
            const waypointsToDraw = drone.route.slice(0, 5); // Focus on immediate path for visibility
            waypointsToDraw.forEach(point => {
                mapCtx.lineTo(toCanvasX(point.lon), toCanvasY(point.lat));
            });
            mapCtx.strokeStyle = routeStrokeStyle;
            mapCtx.lineWidth = routeLineWidth;
            mapCtx.setLineDash(routeLineDash);
            mapCtx.stroke();
            mapCtx.setLineDash([]); // Reset line dash
        }

        // Draw drone icon
        mapCtx.beginPath();
        mapCtx.arc(x, y, 10, 0, Math.PI * 2);
        mapCtx.fillStyle = droneFillColor;
        mapCtx.fill();
        mapCtx.strokeStyle = droneStrokeColor;
        mapCtx.lineWidth = 2;
        mapCtx.stroke();

        // Battery text on drone
        mapCtx.font = '8px Inter';
        mapCtx.fillStyle = '#ffffff';
        mapCtx.textAlign = 'center';
        mapCtx.textBaseline = 'middle';
        mapCtx.fillText(`${drone.battery.toFixed(0)}%`, x, y);

        // Drone name label
        mapCtx.font = '12px Inter';
        mapCtx.fillStyle = '#1f2937';
        mapCtx.textAlign = 'center';
        mapCtx.textBaseline = 'bottom';
        mapCtx.fillText(drone.name, x, y - 12);
    });
}


// --- Live Camera Simulation ---
const cameraCanvas = document.getElementById('cameraCanvas');
const cameraCtx = cameraCanvas.getContext('2d');
let cameraAnimationId = null;
let obstaclePresent = false;
let droneCameraX = 0; // Simulated drone position on camera view
let obstacleX = 0; // Simulated obstacle position

function resizeCameraCanvas() {
    cameraCanvas.width = cameraCanvas.offsetWidth;
    cameraCanvas.height = cameraCanvas.offsetHeight;
    if (cameraAnimationId) { // Redraw if animation is active
        drawCameraFrame();
    }
}

window.addEventListener('resize', () => {
    if (!document.getElementById('camera-view').classList.contains('hidden')) {
        resizeCameraCanvas();
    }
});

function startCameraSimulation() {
    if (cameraAnimationId) return; // Already running
    resizeCameraCanvas();
    addLog('info', 'Drone camera simulation started.');
    cameraAnimationId = requestAnimationFrame(animateCamera);
}

function stopCameraSimulation() {
    if (cameraAnimationId) {
        cancelAnimationFrame(cameraAnimationId);
        cameraAnimationId = null;
        addLog('info', 'Drone camera simulation stopped.');
    }
}

document.getElementById('simulateObstacleBtn').addEventListener('click', () => {
    obstaclePresent = !obstaclePresent;
    addLog('info', `Obstacle simulation ${obstaclePresent ? 'ON' : 'OFF'}.`);
    if (obstaclePresent) {
         showMessage('Obstacle Detected!', 'Simulating an obstacle in the drone\'s path. Dynamic routing adjustments needed!');
         // Automatically trigger a reroute for obstacle avoidance if a drone is en-route
         const activeDrones = drones.filter(d => d.status === 'en-route');
         if (activeDrones.length > 0) {
             // Pick a random drone for this automatic reroute
             const droneToReroute = activeDrones[Math.floor(Math.random() * activeDrones.length)];
             triggerReroute(droneToReroute.id, 'obstacle_avoidance');
         }
    }
});

function animateCamera() {
    drawCameraFrame();
    cameraAnimationId = requestAnimationFrame(animateCamera);
}

function drawCameraFrame() {
    cameraCtx.clearRect(0, 0, cameraCanvas.width, cameraCanvas.height);

    // Simulate background movement
    cameraCtx.fillStyle = '#2d3748'; // Dark blue-gray
    cameraCtx.fillRect(0, 0, cameraCanvas.width, cameraCanvas.height);

    // Simulate ground with moving lines
    cameraCtx.strokeStyle = '#4a5568';
    cameraCtx.lineWidth = 2;
    for (let i = 0; i < cameraCanvas.width; i += 20) {
        const y = ((droneCameraX + i) % 60) * (cameraCanvas.height / 60);
        cameraCtx.beginPath();
        cameraCtx.moveTo(i, y);
        cameraCtx.lineTo(i + 10, y + 20);
        cameraCtx.stroke();
    }
    droneCameraX = (droneCameraX + 0.5) % 60; // Adjust speed

    // Draw simulated drone (bottom center)
    cameraCtx.fillStyle = '#667eea'; // Indigo
    cameraCtx.beginPath();
    cameraCtx.moveTo(cameraCanvas.width / 2, cameraCanvas.height - 20);
    cameraCtx.lineTo(cameraCanvas.width / 2 - 15, cameraCanvas.height - 40);
    cameraCtx.lineTo(cameraCanvas.width / 2 + 15, cameraCanvas.height - 40);
    cameraCtx.closePath();
    cameraCtx.fill();

    // Draw obstacle if present
    if (obstaclePresent) {
        // Animate obstacle moving towards the drone
        obstacleX = (obstacleX - 2) % (cameraCanvas.width + 100);
        if (obstacleX < -50) {
            obstacleX = cameraCanvas.width + Math.random() * 200; // Reset position
        }

        const obstacleSize = 50;
        const obstacleY = cameraCanvas.height / 2 - obstacleSize / 2;

        cameraCtx.fillStyle = '#e53e3e'; // Red for obstacle
        cameraCtx.beginPath();
        cameraCtx.arc(obstacleX, obstacleY, obstacleSize / 2, 0, Math.PI * 2);
        cameraCtx.fill();
        cameraCtx.strokeStyle = '#c53030';
        cameraCtx.lineWidth = 3;
        cameraCtx.stroke();

        cameraCtx.fillStyle = '#ffffff';
        cameraCtx.font = '14px Inter';
        cameraCtx.textAlign = 'center';
        cameraCtx.textBaseline = 'middle'; // Ensure consistent baseline
        cameraCtx.fillText('OBSTACLE!', obstacleX, obstacleY + 5);

        // Simple collision detection (if obstacle is near drone center)
        const droneCenterX = cameraCanvas.width / 2;
        const droneCenterY = cameraCanvas.height - 30;
        if (Math.abs(obstacleX - droneCenterX) < (obstacleSize / 2 + 15) &&
            Math.abs(obstacleY - droneCenterY) < (obstacleSize / 2 + 30)) {
            // console.log("Drone detected obstacle!");
            // This is where dynamic routing in response to obstacle would be triggered in a real system
        }
    } else {
        obstacleX = cameraCanvas.width + 100; // Keep obstacle off screen
    }
}

// Set the drone for camera view
function setSelectedCameraDrone(droneId) {
    const drone = drones.find(d => d.id === droneId);
    if (drone) {
        selectedDroneForCamera = drone;
        showView('camera');
        addLog('info', `Viewing camera feed for drone ${drone.name}.`, drone.id);
    } else {
        showMessage('Error', 'Drone not found for camera view.');
    }
}

// Expose functions to global scope for HTML event handlers
window.closeModal = closeModal;
window.showModal = showModal; // Used by addDroneBtn etc.
window.changeDroneStatus = changeDroneStatus;
window.deleteDrone = deleteDrone;
window.prepareAssignOrder = prepareAssignOrder;
window.completeOrder = completeOrder;
window.cancelOrder = cancelOrder;
window.deleteOrder = deleteOrder;
window.setSelectedCameraDrone = setSelectedCameraDrone;
window.triggerReroute = triggerReroute; // Expose new reroute function
