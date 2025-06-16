document.addEventListener('DOMContentLoaded', () => {
    const navbar = document.querySelector('.navbar');
    const menuToggle = document.querySelector('.menu-toggle');
    const productGrid = document.getElementById('productGrid');
    const warehouseList = document.getElementById('warehouseList');
    const productSearchInput = document.getElementById('productSearch');
    const searchButton = document.getElementById('searchButton');
    const totalInventoryValueEl = document.getElementById('totalInventoryValue');
    const pendingOrdersEl = document.getElementById('pendingOrders');
    const recommendedWarehouseEl = document.getElementById('recommendedWarehouse');

    let allProducts = [];
    let allWarehouses = [];

    // --- Navigation Toggle (Mobile) ---
    menuToggle.addEventListener('click', () => {
        navbar.classList.toggle('active');
    });

    // --- Load Data and Render UI ---
    async function loadInitialData() {
        // Show skeleton loaders
        productGrid.innerHTML = Array(8).fill('<div class="product-card skeleton"><div class="product-image-placeholder"></div><div class="product-info"><h3 class="product-name-placeholder"></h3><p class="product-price-placeholder"></p><p class="product-stock-placeholder"></p></div></div>').join('');

        allProducts = await fetchProducts();
        allWarehouses = await fetchWarehouses();

        renderProducts(allProducts);
        renderWarehouses(allWarehouses);
        updateDashboardStats();
    }

    // --- Render Products ---
    function renderProducts(productsToRender) {
        productGrid.innerHTML = ''; // Clear skeleton loaders
        if (productsToRender.length === 0) {
            productGrid.innerHTML = '<p style="text-align: center; grid-column: 1 / -1;">No products found.</p>';
            return;
        }
        productsToRender.forEach(product => {
            const productCard = document.createElement('div');
            productCard.classList.add('product-card');
            productCard.innerHTML = `
                <img src="${product.imageUrl}" alt="${product.name}">
                <h3>${product.name}</h3>
                <p>Price: <span class="price">$${product.price.toFixed(2)}</span></p>
                <p>Total Stock: <span class="stock" id="stock-${product.id}">Calculating...</span></p>
            `;
            productGrid.appendChild(productCard);
            updateProductTotalStock(product.id); // Calculate and display total stock
        });
    }

    // --- Calculate and Display Total Product Stock ---
    function updateProductTotalStock(productId) {
        const stockEl = document.getElementById(`stock-${productId}`);
        if (!stockEl) return;

        let totalStock = 0;
        allWarehouses.forEach(warehouse => {
            if (warehouse.currentInventory[productId] !== undefined) {
                totalStock += warehouse.currentInventory[productId];
            }
        });
        stockEl.textContent = totalStock;
    }

    // --- Render Warehouses ---
    function renderWarehouses(warehousesToRender) {
        warehouseList.innerHTML = '';
        warehousesToRender.forEach(warehouse => {
            const warehouseCard = document.createElement('div');
            warehouseCard.classList.add('warehouse-card');
            let inventoryHtml = '<ul>';
            Object.keys(warehouse.currentInventory).forEach(productId => {
                const product = allProducts.find(p => p.id === productId);
                if (product) {
                    inventoryHtml += `<li id="wh-${warehouse.id}-prod-${productId}"><span>${product.name}:</span> <span>${warehouse.currentInventory[productId]} units</span></li>`;
                }
            });
            inventoryHtml += '</ul>';

            warehouseCard.innerHTML = `
                <h3>${warehouse.name}</h3>
                <p>Location: ${warehouse.location.lat}, ${warehouse.location.lon}</p>
                <p>Capacity: ${warehouse.capacity} units</p>
                <h4>Current Inventory:</h4>
                ${inventoryHtml}
            `;
            warehouseList.appendChild(warehouseCard);
        });
    }

    // --- Real-time Inventory Update Listener (Uber Model) ---
    document.addEventListener('inventoryUpdated', (event) => {
        const { warehouseId, productId, newStock } = event.detail;

        // Update product total stock display
        updateProductTotalStock(productId);

        // Update specific item in warehouse list
        const listItem = document.getElementById(`wh-${warehouseId}-prod-${productId}`);
        if (listItem) {
            listItem.querySelector('span:last-child').textContent = `${newStock} units`;
            // Add a subtle animation to indicate change
            listItem.style.transition = 'background-color 0.2s ease';
            listItem.style.backgroundColor = '#d4edda'; // Light green for update
            setTimeout(() => {
                listItem.style.backgroundColor = ''; // Revert after a short delay
            }, 500);
        }

        // Re-evaluate dashboard stats and recommendations
        updateDashboardStats();
    });

    // --- Dashboard Stats Update ---
    function updateDashboardStats() {
        let totalValue = 0;
        allWarehouses.forEach(warehouse => {
            Object.keys(warehouse.currentInventory).forEach(productId => {
                const product = allProducts.find(p => p.id === productId);
                if (product) {
                    totalValue += (warehouse.currentInventory[productId] * product.price);
                }
            });
        });
        totalInventoryValueEl.textContent = `$${totalValue.toFixed(2)}`;

        // Simulate pending orders (for hackathon, could be a counter)
        pendingOrdersEl.textContent = Math.floor(Math.random() * 10) + 5; // Random number

        // Smart Warehouse Recommendation (Simplified for Hackathon)
        // In a real system:
        // 1. Get user's/retailer's location (if applicable, using Geolocation API)
        // 2. Consider order details (product quantity)
        // 3. Find warehouses with sufficient stock.
        // 4. Calculate distance to eligible warehouses.
        // 5. Recommend the nearest one with sufficient stock.
        // For hackathon, just pick the one with highest available capacity or first one.
        if (allWarehouses.length > 0) {
            const recommended = allWarehouses.sort((a, b) => b.capacity - a.capacity)[0]; // Simplistic: highest capacity
            recommendedWarehouseEl.textContent = `${recommended.name}`;
        } else {
            recommendedWarehouseEl.textContent = 'N/A';
        }
    }


    // --- Search Functionality ---
    searchButton.addEventListener('click', performSearch);
    productSearchInput.addEventListener('keyup', (event) => {
        if (event.key === 'Enter') {
            performSearch();
        }
    });

    function performSearch() {
        const searchTerm = productSearchInput.value.toLowerCase();
        const filteredProducts = allProducts.filter(product =>
            product.name.toLowerCase().includes(searchTerm) ||
            product.description.toLowerCase().includes(searchTerm)
        );
        renderProducts(filteredProducts);
    }

    // Initialize the application
    loadInitialData();
});