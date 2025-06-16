// Firebase imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import {
    getAuth,
    signInAnonymously,
    signInWithCustomToken,
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
    getFirestore,
    collection,
    addDoc,
    query,
    where,
    onSnapshot,
    deleteDoc,
    doc,
    updateDoc,
    getDoc,
    getDocs
}
 from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Global Firebase variables
let app;
let db;
let auth;
let userId = null;
let productSnapshotUnsubscribe = null;

// Global variables for Firebase config and app ID (provided by environment)
// These variables are injected into the global scope by the Canvas environment.
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-saarthi-app';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};

/**
 * Initializes Firebase application and authentication.
 * Attempts to sign in with a custom token if available, otherwise anonymously.
 * Sets up an authentication state change listener to update UI.
 */
async function initializeFirebase() {
    try {
        app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);

        // Authenticate user using custom token or anonymously
        if (typeof __initial_auth_token !== 'undefined') {
            await signInWithCustomToken(auth, __initial_auth_token);
        } else {
            // Sign in anonymously if no custom token is provided
            await signInAnonymously(auth);
        }

        // Listen for authentication state changes
        onAuthStateChanged(auth, (user) => {
            if (user) {
                userId = user.uid;
                document.getElementById('display-user-id').textContent = userId;

                // All users are treated as 'Retailers' in this anonymous-only setup.
                // The retailer-name-input is made editable for them to set their store name.
                document.getElementById('retailer-name-input').removeAttribute('readonly');
                document.getElementById('retailer-name-input').classList.remove('bg-gray-100');
                // Set a default placeholder for the store name if not already set by user
                if (!document.getElementById('retailer-name-input').value) {
                    document.getElementById('retailer-name-input').value = 'My Store';
                }

                showDashboard();
            } else {
                userId = null;
                document.getElementById('display-user-id').textContent = 'Not logged in';
                // In this version, we automatically log in anonymously, so this state should be rare unless logout occurs
                console.log("User logged out or not authenticated. Re-authenticating anonymously...");
                // Attempt to re-authenticate anonymously if somehow unauthenticated
                signInAnonymously(auth).then(() => {
                    console.log("Re-authenticated anonymously.");
                }).catch(error => {
                    console.error("Failed to re-authenticate anonymously:", error);
                    alert("Authentication failed. Please refresh the page.");
                });
            }
            hideLoading();
        });
    } catch (error) {
        console.error("Error initializing Firebase:", error);
        showMessage('add-product-message', `Firebase initialization failed: ${error.message}`, 'bg-red-100 text-red-700');
        hideLoading();
    }
}

// --- UI State Management Functions ---

/**
 * Shows the loading spinner.
 */
function showLoading() {
    document.getElementById('loading-spinner').classList.remove('hidden');
}

/**
 * Hides the loading spinner.
 */
function hideLoading() {
    document.getElementById('loading-spinner').classList.add('hidden');
}

/**
 * Displays the main dashboard section and sets the default tab.
 */
function showDashboard() {
    document.getElementById('retailer-dashboard-section').classList.remove('hidden');
    document.getElementById('retailer-dashboard-section').classList.add('animated-section');
    showTab('dashboard'); // Default to overview tab
    setupProductListener(); // Start listening for product updates
}

/**
 * Handles user logout. Signs out the current Firebase user.
 */
async function handleLogout() {
    showLoading();
    try {
        await signOut(auth);
        // Unsubscribe from real-time listener when logging out
        if (productSnapshotUnsubscribe) {
            productSnapshotUnsubscribe();
            productSnapshotUnsubscribe = null;
        }
        console.log("Logged out successfully.");
        // Use custom confirmation modal instead of alert
        showCustomConfirm("You have been logged out. Refresh the page to get a new session.", () => {});
    } catch (error) {
        console.error("Logout error:", error);
        showMessage('add-product-message', `Logout failed: ${error.message}`, 'bg-red-100 text-red-700');
    } finally {
        hideLoading();
    }
}

/**
 * Switches between different dashboard tabs with animations.
 * @param {string} tabId - The ID of the tab to show.
 */
function showTab(tabId) {
    const allTabContents = document.querySelectorAll('.tab-content');
    let activeTabContent = null;

    // Find the currently active tab and apply exit animation
    allTabContents.forEach(content => {
        if (!content.classList.contains('hidden')) {
            activeTabContent = content;
            content.classList.remove('is-entering'); // Ensure no lingering entry animation class
            content.classList.add('is-leaving'); // Trigger exit animation
        }
    });

    // Deactivate all tab buttons' active styles
    document.querySelectorAll('.tab-button').forEach(button => {
        button.classList.remove('border-saarthi-green', 'text-saarthi-green');
        button.classList.add('border-transparent', 'text-gray-600', 'hover:text-saarthi-green');
    });

    const targetTabContent = document.getElementById(`${tabId}-tab-content`);

    const performTabSwitch = () => {
        // Hide all tab content sections after the exit animation completes
        allTabContents.forEach(content => {
            content.classList.add('hidden');
            content.classList.remove('is-leaving', 'is-entering'); // Clean up animation classes
        });

        // Show the selected tab content and activate its button
        targetTabContent.classList.remove('hidden');
        targetTabContent.classList.add('is-entering'); // Trigger entry animation

        document.getElementById(`tab-${tabId}`).classList.add('border-saarthi-green', 'text-saarthi-green');
        document.getElementById(`tab-${tabId}`).classList.remove('border-transparent', 'text-gray-600', 'hover:text-saarthi-green');

        // Trigger specific rendering/animations based on tabId
        if (tabId === 'ai-insights') {
            renderAIInsights();
        } else if (tabId === 'dashboard') {
            document.querySelectorAll('.stat-card').forEach((card, index) => {
                card.style.animationDelay = `${index * 0.1}s`; // Stagger animation
                card.classList.remove('is-animated'); // Remove to re-trigger if already there
                void card.offsetWidth; // Trigger reflow for animation restart
                card.classList.add('is-animated'); // Add animation
            });
        }
    };

    if (activeTabContent) {
        // Wait for the old tab's exit animation to complete before showing the new one
        activeTabContent.addEventListener('animationend', function handler() {
            activeTabContent.removeEventListener('animationend', handler);
            performTabSwitch();
        }, { once: true });
    } else {
        // No active tab, perform switch immediately
        performTabSwitch();
    }
}


/**
 * Adds a new product to the Firestore database.
 * Includes input validation and displays messages.
 */
async function addProduct() {
    if (!userId) {
        showMessage('add-product-message', 'Authentication failed. Please refresh the page.', 'bg-red-100 text-red-700');
        return;
    }

    const productName = document.getElementById('product-name').value;
    const productCategory = document.getElementById('product-category').value;
    const productPrice = parseFloat(document.getElementById('product-price').value);
    const productStock = parseInt(document.getElementById('product-stock').value, 10);
    const minStockThreshold = parseInt(document.getElementById('min-stock-threshold').value, 10);
    const maxStockThreshold = parseInt(document.getElementById('max-stock-threshold').value, 10);
    const retailerNameInput = document.getElementById('retailer-name-input').value;

    if (!productName || !productCategory || isNaN(productPrice) || isNaN(productStock) || !retailerNameInput || isNaN(minStockThreshold) || isNaN(maxStockThreshold)) {
        showMessage('add-product-message', 'Please fill in all product details, including stock thresholds and your store name.', 'bg-red-100 text-red-700');
        return;
    }

    if (minStockThreshold >= maxStockThreshold) {
        showMessage('add-product-message', 'Minimum stock threshold must be less than maximum stock threshold.', 'bg-red-100 text-red-700');
        return;
    }


    showLoading();
    try {
        const productsCollectionRef = collection(db, `artifacts/${appId}/public/data/products`);
        await addDoc(productsCollectionRef, {
            name: productName,
            category: productCategory,
            price: productPrice.toFixed(2),
            stock: productStock,
            minStockThreshold: minStockThreshold,
            maxStockThreshold: maxStockThreshold,
            retailerId: userId, // User's anonymous UID
            retailerDisplayName: retailerNameInput, // Store the chosen store name
            createdAt: new Date()
        });

        document.getElementById('add-product-form').reset();
        showMessage('add-product-message', 'Product added successfully!', 'bg-green-100 text-green-700');
    } catch (error) {
        console.error("Error adding product:", error);
        showMessage('add-product-message', `Failed to add product: ${error.message}`, 'bg-red-100 text-red-700');
    } finally {
        hideLoading();
    }
}

/**
 * Sets up a real-time Firestore listener for product listings.
 * Filters products by the current user's ID for 'My Listings' view.
 */
function setupProductListener() {
    if (productSnapshotUnsubscribe) {
        productSnapshotUnsubscribe(); // Unsubscribe previous listener if exists
    }

    const productsCollectionRef = collection(db, `artifacts/${appId}/public/data/products`);
    let q;

    // For "My Listings", always filter by the current user's ID
    q = query(productsCollectionRef, where('retailerId', '==', userId));

    productSnapshotUnsubscribe = onSnapshot(q, (snapshot) => {
        const products = [];
        snapshot.forEach(doc => {
            products.push({ id: doc.id, ...doc.data() });
        });
        renderProductListings(products); // Call function to render product listings
        updateTotalProductsCount(products.length); // Call function to update total products count
        renderStockAlerts(products); // Call function to render stock alerts based on fetched products
    }, (error) => {
        console.error("Error fetching real-time products:", error);
        showMessage('my-listings-tab-content', `Error loading listings: ${error.message}`, 'bg-red-100 text-red-700');
    });
}

/**
 * Renders the list of products in the "My Listings" tab.
 * Includes visual alerts for low/overstocked items and staggered entry animation.
 * @param {Array<Object>} products - An array of product objects from Firestore.
 */
function renderProductListings(products) {
    const productListingsDiv = document.getElementById('product-listings');
    productListingsDiv.innerHTML = ''; // Clear existing listings

    if (products.length === 0) {
        document.getElementById('no-products-message').classList.remove('hidden');
        return;
    } else {
        document.getElementById('no-products-message').classList.add('hidden');
    }

    products.forEach((product, index) => {
        const productCard = document.createElement('div');
        productCard.className = 'product-card bg-gray-50 p-4 rounded-lg shadow-sm border border-gray-200 product-card-enter';
        // Apply staggered animation delay
        productCard.style.animationDelay = `${index * 0.08}s`; // Slightly increased stagger
        
        let stockAlertHtml = '';
        // Ensure minStockThreshold and maxStockThreshold exist and are numbers
        const minThreshold = product.minStockThreshold !== undefined ? parseInt(product.minStockThreshold, 10) : 0;
        const maxThreshold = product.maxStockThreshold !== undefined ? parseInt(product.maxStockThreshold, 10) : Infinity;

        if (product.stock <= minThreshold) {
            stockAlertHtml = `
                <span class="stock-alert stock-low alert-pulse">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                    Low Stock (${product.stock} left)
                </span>
            `;
        } else if (product.stock >= maxThreshold) {
            stockAlertHtml = `
                <span class="stock-alert stock-over alert-pulse">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"></path></svg>
                    Overstocked (${product.stock})
                </span>
            `;
        }

        // Add product details and action buttons
        productCard.innerHTML = `
            <h4 class="text-xl font-semibold text-gray-800 mb-2">${product.name}</h4>
            <p class="text-gray-600 text-sm mb-1">Category: <span class="font-medium text-gray-700">${product.category}</span></p>
            <p class="text-gray-600 text-sm mb-1">Price: <span class="font-medium text-green-600">$${product.price}</span></p>
            <p class="text-gray-600 text-sm mb-3">Stock: <span class="font-medium text-blue-600">${product.stock} units</span></p>
            <p class="text-gray-600 text-xs mb-3">Store: <span class="font-medium text-purple-600">${product.retailerDisplayName}</span></p>
            ${stockAlertHtml}
            <div class="flex justify-end gap-2 mt-4">
                <button data-product-id="${product.id}" class="edit-product-btn text-indigo-600 hover:text-indigo-800 text-sm font-medium transition duration-200">Edit</button>
                <button data-product-id="${product.id}" class="delete-product-btn text-red-600 hover:text-red-800 text-sm font-medium transition duration-200">Delete</button>
            </div>
        `;
        productListingsDiv.appendChild(productCard);
    });

    // Attach event listeners to newly rendered buttons
    productListingsDiv.querySelectorAll('.edit-product-btn').forEach(button => {
        button.addEventListener('click', (event) => {
            button.classList.add('animate-button-press');
            setTimeout(() => button.classList.remove('animate-button-press'), 200);
            editProduct(event.target.dataset.productId);
        });
    });
    productListingsDiv.querySelectorAll('.delete-product-btn').forEach(button => {
        button.addEventListener('click', (event) => {
            button.classList.add('animate-button-press');
            setTimeout(() => button.classList.remove('animate-button-press'), 200);
            deleteProduct(event.target.dataset.productId);
        });
    });
}

/**
 * Handles the editing of a product's stock quantity.
 * @param {string} productId - The ID of the product to edit.
 */
async function editProduct(productId) {
    const productRef = doc(db, `artifacts/${appId}/public/data/products`, productId);
    try {
        const productSnap = await getDoc(productRef);
        if (productSnap.exists()) {
            const productData = productSnap.data();
            const newStock = prompt(`Enter new stock quantity for ${productData.name} (Current: ${productData.stock}):`);
            if (newStock !== null && !isNaN(parseInt(newStock, 10))) {
                await updateDoc(productRef, { stock: parseInt(newStock, 10) });
                showMessage('add-product-message', `Stock for "${productData.name}" updated successfully!`, 'bg-green-100 text-green-700');
            } else if (newStock !== null) {
                showMessage('add-product-message', 'Invalid stock quantity entered.', 'bg-red-100 text-red-700');
            }
        }
    } catch (error) {
        console.error("Error editing product:", error);
        showMessage('add-product-message', `Failed to load product for edit: ${error.message}`, 'bg-red-100 text-red-700');
    }
}

/**
 * Deletes a product from Firestore after user confirmation.
 * Adds fade-out and shrink animation for the deleted product card.
 * @param {string} productId - The ID of the product to delete.
 */
async function deleteProduct(productId) {
    const productRef = doc(db, `artifacts/${appId}/public/data/products`, productId);
    let productName = "this product";
    // Find the closest product card element to apply animation
    const productCardElement = document.getElementById('product-listings').querySelector(`[data-product-id="${productId}"]`)?.closest('.product-card');

    try {
        const docSnap = await getDoc(productRef);
        if (docSnap.exists()) {
            productName = docSnap.data().name;
        }
    } catch (error) {
        console.error("Error fetching product for deletion confirmation:", error);
    }

    showCustomConfirm(`Are you sure you want to delete "${productName}"?`, async () => {
        showLoading();
        try {
            if (productCardElement) {
                // Apply deletion animation
                productCardElement.classList.add('deleting');
                productCardElement.addEventListener('animationend', async function handler() {
                    await deleteDoc(productRef);
                    productCardElement.removeEventListener('animationend', handler);
                    productCardElement.remove(); // Remove element from DOM after animation
                    showMessage('add-product-message', `"${productName}" deleted successfully!`, 'bg-green-100 text-green-700');
                    hideLoading(); // Hide loading after doc removal and message
                }, { once: true });
            } else {
                // If element not found (e.g., deleted from another session), just delete from DB
                await deleteDoc(productRef);
                showMessage('add-product-message', `"${productName}" deleted successfully!`, 'bg-green-100 text-green-700');
                hideLoading();
            }
        } catch (error) {
            console.error("Error deleting product:", error);
            showMessage('add-product-message', `Failed to delete product: ${error.message}`, 'bg-red-100 text-red-700');
            hideLoading();
        }
    });
}

/**
 * Updates the total products count displayed in the dashboard overview.
 * @param {number} count - The total number of products.
 */
function updateTotalProductsCount(count) {
    document.getElementById('total-products-count').textContent = count;
}

/**
 * Displays a temporary message in a specified UI element with animation.
 * @param {string} elementId - The ID of the element where the message will be displayed.
 * @param {string} message - The message text.
 * @param {string} classes - Tailwind CSS classes to apply to the message element for styling.
 */
function showMessage(elementId, message, classes) {
    const messageElement = document.getElementById(elementId);
    messageElement.textContent = message;
    // Remove previous animation classes and add entry animation class
    messageElement.classList.remove('is-leaving', 'hidden');
    messageElement.className = `mt-4 p-3 rounded-lg text-center ${classes} message-box is-entering`; 

    // After entry animation, schedule it to fade out
    messageElement.addEventListener('animationend', function handler() {
        messageElement.removeEventListener('animationend', handler);
        setTimeout(() => {
            messageElement.classList.remove('is-entering');
            messageElement.classList.add('is-leaving'); // Start leaving animation
            messageElement.addEventListener('animationend', function handler2() {
                messageElement.removeEventListener('animationend', handler2);
                messageElement.classList.add('hidden');
                messageElement.classList.remove('is-leaving');
                messageElement.textContent = ''; // Clear text after hidden
            }, { once: true });
        }, 4000); // Display for 4 seconds before starting fade out
    }, { once: true });
}

/**
 * Displays a custom confirmation modal.
 * @param {string} message - The message to display in the confirmation modal.
 * @param {Function} onConfirm - Callback function to execute if the user confirms.
 */
function showCustomConfirm(message, onConfirm) {
    const confirmModal = document.getElementById('custom-confirm-modal');
    const modalContent = confirmModal.querySelector('div');
    
    document.getElementById('confirm-message').textContent = message;

    const confirmBtn = document.getElementById('confirm-ok-btn');
    const cancelBtn = document.getElementById('confirm-cancel-btn');

    // Event listeners are re-attached to ensure they're clean and don't double-fire.
    const handleConfirm = () => {
        modalContent.classList.remove('modal-enter');
        confirmModal.classList.add('hidden');
        confirmBtn.removeEventListener('click', handleConfirm);
        cancelBtn.removeEventListener('click', handleCancel);
        onConfirm();
    };

    const handleCancel = () => {
        confirmModal.classList.add('hidden');
        confirmBtn.removeEventListener('click', handleConfirm);
        cancelBtn.removeEventListener('click', handleCancel);
    };

    // Remove existing listeners before adding new ones to prevent duplicates
    confirmBtn.removeEventListener('click', handleConfirm);
    cancelBtn.removeEventListener('click', handleCancel);

    confirmBtn.addEventListener('click', handleConfirm);
    cancelBtn.addEventListener('click', handleCancel);

    confirmModal.classList.remove('hidden');
    modalContent.classList.add('modal-enter'); // Trigger entry animation
}

/**
 * Renders the lists of low-stock and overstocked items in the "Stock Alerts" tab.
 * Includes staggered entry animation for list items.
 * @param {Array<Object>} products - An array of product objects from Firestore.
 */
function renderStockAlerts(products) {
    const lowStockList = document.getElementById('low-stock-items');
    const overstockedList = document.getElementById('overstocked-items');

    lowStockList.innerHTML = ''; // Clear previous alerts
    overstockedList.innerHTML = ''; // Clear previous alerts

    // Filter products based on stock thresholds
    const lowStockProducts = products.filter(p => p.stock <= (p.minStockThreshold || 0));
    const overstockedProducts = products.filter(p => p.stock >= (p.maxStockThreshold || Infinity));

    // Populate Low Stock Items list
    if (lowStockProducts.length === 0) {
        lowStockList.innerHTML = '<li class="text-gray-500">No low stock items detected.</li>';
    } else {
        lowStockProducts.forEach((p, index) => {
            const listItem = document.createElement('li');
            listItem.className = 'bg-red-50 p-3 rounded-lg flex items-center justify-between stock-low alert-pulse stock-alert-item product-card-enter';
            // Apply staggered animation delay
            listItem.style.animationDelay = `${index * 0.08}s`;
            listItem.innerHTML = `
                <div class="flex items-center gap-2">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                    <span class="font-medium text-red-800">${p.name}</span>
                </div>
                <span class="text-sm text-red-600">Stock: ${p.stock} (Threshold: ${p.minStockThreshold})</span>
            `;
            lowStockList.appendChild(listItem);
        });
    }

    // Populate Overstocked Items list
    if (overstockedProducts.length === 0) {
        overstockedList.innerHTML = '<li class="text-gray-500">No overstocked items detected.</li>';
    } else {
        overstockedProducts.forEach((p, index) => {
            const listItem = document.createElement('li');
            listItem.className = 'bg-blue-50 p-3 rounded-lg flex items-center justify-between stock-over alert-pulse stock-alert-item product-card-enter';
            // Apply staggered animation delay (continue from low stock items total)
            listItem.style.animationDelay = `${(lowStockProducts.length + index) * 0.08}s`; 
            listItem.innerHTML = `
                <div class="flex items-center gap-2">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"></path></svg>
                    <span class="font-medium text-blue-800">${p.name}</span>
                </div>
                <span class="text-sm text-blue-600">Stock: ${p.stock} (Threshold: ${p.maxStockThreshold})</span>
            `;
            overstockedList.appendChild(listItem);
        });
    }
}

// --- AI Insights Simulation ---
/**
 * Renders simulated AI-powered business insights.
 * Fetches all products from Firestore to base insights on.
 */
async function renderAIInsights() {
    const productsCollectionRef = collection(db, `artifacts/${appId}/public/data/products`);
    let productsData = [];

    try {
        // Fetch ALL products for AI insights analysis.
        const querySnapshot = await getDocs(query(productsCollectionRef));
        productsData = querySnapshot.docs.map(doc => doc.data());

        // Simulate past order trends based on available products
        const pastOrderTrendsEl = document.getElementById('past-order-trends');
        pastOrderTrendsEl.innerHTML = '';
        if (productsData.length > 0) {
            // Sort by stock as a proxy for "top selling" in this simulation
            const topProducts = productsData.sort((a, b) => b.stock - a.stock).slice(0, 3);
            topProducts.forEach(p => {
                pastOrderTrendsEl.innerHTML += `<li>${p.name} (${p.category}) - High demand.</li>`;
            });
            if (topProducts.length === 0) {
                pastOrderTrendsEl.innerHTML = '<li>No significant past order trends available yet.</li>';
            }
        } else {
            pastOrderTrendsEl.innerHTML = '<li>No product data to analyze for past order trends.</li>';
        }

        // Simulate festival trends
        const festivalTrendsEl = document.getElementById('festival-trends');
        festivalTrendsEl.innerHTML = '';
        const currentMonth = new Date().getMonth(); // 0 for Jan, 11 for Dec
        let festivalSuggestion = '';
        if (currentMonth >= 8 && currentMonth <= 10) { // Sept-Nov (Autumn/Holiday prep)
            festivalSuggestion = 'Demand for festive decorations, gifts, and seasonal produce (e.g., pumpkins) is expected to rise. Consider promoting holiday bundles.';
        } else if (currentMonth >= 5 && currentMonth <= 7) { // June-Aug (Summer)
            festivalSuggestion = 'Summer essentials like beverages, outdoor equipment, and fresh produce are trending. Focus on BBQ items and beach accessories.';
        } else if (currentMonth >= 2 && currentMonth <= 4) { // March-May (Spring)
            festivalSuggestion = 'Spring cleaning supplies, gardening tools, and light clothing are gaining traction. Prepare for Easter and Mother\'s Day sales.';
        } else { // Winter / Other
            festivalSuggestion = 'General consumer goods and comfort items are stable. Look out for unexpected viral trends.';
        }
        festivalTrendsEl.innerHTML = `<li>${festivalSuggestion}</li>`;
        festivalTrendsEl.innerHTML += `<li>(Simulated based on current month)</li>`;


        // Simulate most searched products (could be based on category diversity)
        const mostSearchedProductsEl = document.getElementById('most-searched-products');
        mostSearchedProductsEl.innerHTML = '';
        const categories = [...new Set(productsData.map(p => p.category))];
        if (categories.length > 0) {
             mostSearchedProductsEl.innerHTML += `<li>Currently popular categories: ${categories.join(', ')}.</li>`;
        }
        mostSearchedProductsEl.innerHTML += `<li>(Simulated based on existing categories)</li>`;


        // Simulate future predictions
        const futurePredictionsEl = document.getElementById('future-predictions');
        futurePredictionsEl.innerHTML = '';
        const futureTrends = [
            'Emerging trend: Sustainable and ethically sourced products.',
            'Increase in demand for personalized items.',
            'Growth in online-to-offline (O2O) shopping experiences.'
        ];
        futureTrends.forEach(trend => {
            futurePredictionsEl.innerHTML += `<li>${trend}</li>`;
        });
        futurePredictionsEl.innerHTML += `<li>(General market outlook)</li>`;


    } catch (error) {
        console.error("Error fetching data for AI insights:", error);
        document.getElementById('past-order-trends').innerHTML = '<li>Error loading insights.</li>';
        document.getElementById('festival-trends').innerHTML = '<li>Error loading insights.</li>';
        document.getElementById('most-searched-products').innerHTML = '<li>Error loading insights.</li>';
        document.getElementById('future-predictions').innerHTML = '<li>Error loading insights.</li>';
    }
}

// --- Event Listeners Initialization ---
// Attach event listeners after the DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    // Tab buttons
    document.getElementById('tab-dashboard').addEventListener('click', () => showTab('dashboard'));
    document.getElementById('tab-add-product').addEventListener('click', () => showTab('add-product'));
    document.getElementById('tab-my-listings').addEventListener('click', () => showTab('my-listings'));
    document.getElementById('tab-stock-alerts').addEventListener('click', () => showTab('stock-alerts'));
    document.getElementById('tab-ai-insights').addEventListener('click', () => showTab('ai-insights'));

    // Add Product Form submission
    document.getElementById('add-product-form').addEventListener('submit', (event) => {
        event.preventDefault();
        addProduct();
    });

    // Add Product submit button animation
    document.getElementById('add-product-submit-btn').addEventListener('click', (event) => {
        event.target.classList.add('animate-button-press');
        setTimeout(() => event.target.classList.remove('animate-button-press'), 200);
    });

    // Confirmation Modal Buttons
    document.getElementById('confirm-ok-btn').addEventListener('click', (event) => {
        event.target.classList.add('animate-button-press');
        setTimeout(() => event.target.classList.remove('animate-button-press'), 200);
        // The actual confirmation logic is handled by showCustomConfirm's internal handlers
    });
    document.getElementById('confirm-cancel-btn').addEventListener('click', (event) => {
        event.target.classList.add('animate-button-press');
        setTimeout(() => event.target.classList.remove('animate-button-press'), 200);
        // The actual cancellation logic is handled by showCustomConfirm's internal handlers
    });

    // Logout button
    document.getElementById('logout-btn').addEventListener('click', (event) => {
        event.target.classList.add('animate-button-press');
        setTimeout(() => event.target.classList.remove('animate-button-press'), 200);
        handleLogout();
    });

    // Initial Firebase and dashboard setup
    initializeFirebase();
});
