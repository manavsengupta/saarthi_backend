// Mock Products
const mockProducts = [
    { id: 'prod001', name: 'Smart TV', description: '55-inch 4K UHD Smart TV', price: 499.99, imageUrl: 'https://via.placeholder.com/180x180?text=Smart+TV' },
    { id: 'prod002', name: 'Laptop Pro', description: 'High-performance laptop for professionals', price: 1299.00, imageUrl: 'https://via.placeholder.com/180x180?text=Laptop' },
    { id: 'prod003', name: 'Wireless Headphones', description: 'Noise-cancelling over-ear headphones', price: 199.50, imageUrl: 'https://via.placeholder.com/180x180?text=Headphones' },
    { id: 'prod004', name: 'Coffee Maker', description: 'Programmable drip coffee maker', price: 75.00, imageUrl: 'https://via.placeholder.com/180x180?text=Coffee+Maker' },
    { id: 'prod005', name: 'Gaming Console', description: 'Next-gen gaming console', price: 399.00, imageUrl: 'https://via.placeholder.com/180x180?text=Console' },
    { id: 'prod006', name: 'Robot Vacuum', description: 'Smart robot vacuum cleaner', price: 299.99, imageUrl: 'https://via.placeholder.com/180x180?text=Robot+Vacuum' },
];

// Mock Warehouses with inventory (Uber Model: dynamic inventory)
const mockWarehouses = [
    { id: 'wh001', name: 'Warehouse Delhi', location: { lat: 28.6139, lon: 77.2090 }, capacity: 10000, currentInventory: {} },
    { id: 'wh002', name: 'Warehouse Mumbai', location: { lat: 19.0760, lon: 72.8777 }, capacity: 8000, currentInventory: {} },
    { id: 'wh003', name: 'Warehouse Bengaluru', location: { lat: 12.9716, lon: 77.5946 }, capacity: 12000, currentInventory: {} },
    { id: 'wh004', name: 'Warehouse Chennai', location: { lat: 13.0827, lon: 80.2707 }, capacity: 9000, currentInventory: {} },
];

// Simulate initial inventory distribution
function initializeInventory() {
    mockProducts.forEach(product => {
        mockWarehouses.forEach(warehouse => {
            const stock = Math.floor(Math.random() * 200) + 50; // Random stock between 50 and 250
            warehouse.currentInventory[product.id] = stock;
        });
    });
}

initializeInventory();

// Mock API functions
async function fetchProducts() {
    return new Promise(resolve => setTimeout(() => resolve(mockProducts), 500)); // Simulate network delay
}

async function fetchWarehouses() {
    return new Promise(resolve => setTimeout(() => resolve(mockWarehouses), 600));
}

// Simulate real-time inventory update (Uber model)
// In a real scenario, this would be WebSocket or polling from a backend.
function simulateRealtimeInventoryUpdate() {
    setInterval(() => {
        const randomWarehouse = mockWarehouses[Math.floor(Math.random() * mockWarehouses.length)];
        const randomProduct = mockProducts[Math.floor(Math.random() * mockProducts.length)];
        const change = Math.random() < 0.5 ? -1 : 1; // Increase or decrease
        const amount = Math.floor(Math.random() * 5) + 1; // Change by 1-5 units

        if (randomWarehouse.currentInventory[randomProduct.id] !== undefined) {
            randomWarehouse.currentInventory[randomProduct.id] = Math.max(0, randomWarehouse.currentInventory[randomProduct.id] + (change * amount));
            console.log(`Inventory updated for ${randomProduct.name} in ${randomWarehouse.name}: ${randomWarehouse.currentInventory[randomProduct.id]}`);
            // Trigger a UI update for relevant sections (e.g., warehouse list, product stock)
            document.dispatchEvent(new CustomEvent('inventoryUpdated', { detail: { warehouseId: randomWarehouse.id, productId: randomProduct.id, newStock: randomWarehouse.currentInventory[randomProduct.id] } }));
        }
    }, 3000); // Update every 3 seconds
}

simulateRealtimeInventoryUpdate();