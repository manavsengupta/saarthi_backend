document.addEventListener('DOMContentLoaded', () => {
    // Get DOM elements for interaction
    const itemInput = document.getElementById('itemInput');
    const locationInput = document.getElementById('locationInput');
    const analyzeOrderBtn = document.getElementById('analyzeOrderBtn');
    const resultsContainer = document.getElementById('resultsContainer');

    // --- Simulated Backend Data (for demonstration purposes) ---
    // Represents available warehouses, their locations, and items they stock
    const warehouses = [
        { id: 'W001', name: 'West Coast Distribution Center', location: 'San Francisco', items: ['Laptop', 'Headphones', 'Tablet', 'Webcam', 'Drone'] },
        { id: 'W002', name: 'Midwest Fulfillment Hub', location: 'Chicago', items: ['T-shirt', 'Jeans', 'Shoes', 'Groceries', 'Cookware'] },
        { id: 'W003', name: 'Northeast Logistics Depot', location: 'New York', items: ['Books', 'Stationery', 'Desk', 'Office Chair', 'Printer'] },
        { id: 'W004', name: 'Southeast Regional Warehouse', location: 'Atlanta', items: ['Outdoor Gear', 'Fitness Equipment', 'Sports Apparel'] }
    ];

    // Represents local delivery partners and the areas they cover
    const localDeliveryPartners = [
        { id: 'LDP001', name: 'CitySprint Couriers', coversLocation: 'San Francisco' },
        { id: 'LDP002', name: 'MetroFast Delivery', coversLocation: 'Chicago' }
    ];

    // Function to reset all custom background classes on the results container
    function resetResultsContainerClasses() {
        resultsContainer.classList.remove('bg-optimal', 'bg-nearby', 'bg-none', 'bg-error', 'bg-initial');
    }

    // --- Event Listener for the "Analyze Delivery Route" Button ---
    analyzeOrderBtn.addEventListener('click', () => {
        const item = itemInput.value.trim();
        const customerLocation = locationInput.value.trim();

        // Reset all previous state classes and set to default initial state
        resetResultsContainerClasses();
        resultsContainer.classList.add('bg-initial'); // Set to initial state background

        // Display loading spinner with pulsating text animation
        resultsContainer.innerHTML = `
            <div class="spinner-container">
                <div class="spinner mb-3"></div>
                <p class="text-blue-300 text-lg font-medium spinner-text">Analyzing optimal delivery path...</p>
            </div>
            <div class="background-texture"></div> <!-- Keep texture during loading -->
        `;

        // Input validation
        if (!item || !customerLocation) {
            // Update content immediately with error message and fade-in animation
            resultsContainer.innerHTML = `
                <div class="text-red-300 font-semibold text-lg fade-in-up">
                    Please enter both customer item and location for analysis.
                </div>
                <div class="background-texture"></div>
            `;
            resetResultsContainerClasses();
            resultsContainer.classList.add('bg-error'); // Apply error background
            return; // Exit if inputs are empty
        }

        // Simulate network request or complex processing time
        setTimeout(() => {
            processOrderForExecutive(item, customerLocation);
        }, 1800); // Increased delay for a more noticeable loading animation and transition
    });

    // --- Core Logic: Process Order and Generate Delivery Recommendation ---
    function processOrderForExecutive(item, customerLocation) {
        let foundInNearbyWarehouse = false;
        let identifiedWarehouseName = '';

        // 1. Check if the ordered item is available in any 'nearby' warehouse
        for (const warehouse of warehouses) {
            const isNearby = warehouse.location.toLowerCase() === customerLocation.toLowerCase();
            const itemAvailable = warehouse.items.some(wareHouseItem => wareHouseItem.toLowerCase() === item.toLowerCase());

            if (isNearby && itemAvailable) {
                foundInNearbyWarehouse = true;
                identifiedWarehouseName = warehouse.name;
                break;
            }
        }

        let recommendationHTML = '';
        let successType = ''; // To control background/border color

        // 2. Based on availability, construct the appropriate recommendation message
        if (foundInNearbyWarehouse) {
            const localPartnerAvailable = localDeliveryPartners.some(partner =>
                partner.coversLocation.toLowerCase() === customerLocation.toLowerCase()
            );

            if (localPartnerAvailable) {
                // Scenario 1: Item in nearby warehouse AND local partner available
                recommendationHTML = `
                    <div class="text-center flex flex-col items-center w-full">
                        <p class="text-green-300 text-xl md:text-2xl font-bold mb-3 animate-pop-in" style="animation-delay: 0s;">
                            ✅ Optimal Fulfillment Opportunity!
                        </p>
                        <p class="text-gray-200 text-lg mb-4 fade-in-up" style="animation-delay: 0.1s;">
                            The customer's order for "<span class="font-semibold">${item}</span>"
                            is stocked at our <span class="font-semibold">${identifiedWarehouseName}</span>,
                            proximate to <span class="font-semibold">${customerLocation}</span>.
                        </p>
                        <div class="inline-block bg-teal-800 text-teal-200 text-sm md:text-base font-bold px-5 py-2.5 rounded-full mb-4 animate-pulse-custom animate-pop-in shadow-md" style="animation-delay: 0.3s;">
                            🚀 Eligible for Local Delivery Partner!
                        </div>
                        <p class="text-gray-300 text-base fade-in-up" style="animation-delay: 0.4s;">
                            Recommendation: Proceed with a local delivery partner for expedited service and reduced logistics costs.
                        </p>
                        <button class="mt-6 bg-teal-600 text-white font-bold py-2.5 px-6 rounded-lg shadow-lg hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 transition duration-300 ease-in-out transform animate-zoom-in" style="animation-delay: 0.5s;">
                            Assign Local Delivery
                        </button>
                    </div>
                `;
                successType = 'optimal';
            } else {
                // Scenario 2: Item in nearby warehouse, but NO local partner for this area
                recommendationHTML = `
                    <div class="text-center flex flex-col items-center w-full">
                        <p class="text-orange-300 text-xl md:text-2xl font-bold mb-3 animate-pop-in" style="animation-delay: 0s;">
                            📦 Item Available Nearby!
                        </p>
                        <p class="text-gray-200 text-lg mb-4 fade-in-up" style="animation-delay: 0.1s;">
                            The customer's order for "<span class="font-semibold">${item}</span>" is available
                            at <span class="font-semibold">${identifiedWarehouseName}</span> in <span class="font-semibold">${customerLocation}</span>.
                        </p>
                        <p class="text-gray-300 text-base fade-in-up" style="animation-delay: 0.2s;">
                            Note: A dedicated local delivery partner is not currently available for this specific area. Standard delivery logistics will apply.
                        </p>
                    </div>
                `;
                successType = 'nearby';
            }
        } else {
            // Scenario 3: Item not found in any nearby warehouse
            recommendationHTML = `
                <div class="text-center flex flex-col items-center w-full">
                    <p class="text-red-300 text-xl md:text-2xl font-bold mb-3 animate-pop-in" style="animation-delay: 0s;">
                        ❌ No Immediate Local Fulfillment
                    </p>
                    <p class="text-gray-200 text-lg mb-4 fade-in-up" style="animation-delay: 0.1s;">
                        The ordered item "<span class="font-semibold">${item}</span>" was not found in a warehouse
                        near <span class="font-semibold">${customerLocation}</span>.
                    </p>
                    <p class="text-gray-300 text-base fade-in-up" style="animation-delay: 0.2s;">
                        Recommendation: Fulfill from main distribution centers via standard shipping channels.
                    </p>
                </div>
            `;
            successType = 'none';
        }

        // Update the results container with the generated HTML
        resultsContainer.innerHTML = recommendationHTML + `<div class="background-texture"></div>`; // Re-add texture

        // Apply dynamic background/border/shadow classes based on success type
        resetResultsContainerClasses(); // Clear any existing result-specific classes first
        if (successType === 'optimal') {
            resultsContainer.classList.add('bg-optimal');
        } else if (successType === 'nearby') {
            resultsContainer.classList.add('bg-nearby');
        } else if (successType === 'none') {
            resultsContainer.classList.add('bg-none');
        }
    }
});
