document.addEventListener('DOMContentLoaded', () => {
    const recommendationForm = document.getElementById('recommendation-form');
    const getRecommendationBtn = document.getElementById('get-recommendation-btn');
    const recommendationResultDiv = document.getElementById('recommendation-result');
    const loadingSpinner = document.getElementById('loading-spinner');

    const inputFields = recommendationForm.querySelectorAll('input, select');
    let recommendationTimer;
    const debounceDelay = 700; // Time in ms (0.7 seconds) after last input before triggering

    // Function to trigger the recommendation logic
    const triggerRecommendation = async () => {
        const allRequiredFilled = Array.from(inputFields).every(field => {
            return field.hasAttribute('required') ? field.value.trim() !== '' : true;
        });

        if (allRequiredFilled) {
            loadingSpinner.style.display = 'block';
            recommendationResultDiv.innerHTML = ''; // Clear existing recommendation
            getRecommendationBtn.disabled = true;

            const productName = document.getElementById('product-name').value;
            const quantity = parseInt(document.getElementById('quantity').value);
            const deliveryAddress = document.getElementById('delivery-address').value;
            const customerTier = document.getElementById('customer-tier').value;
            const deliveryPriority = document.getElementById('delivery-priority').value;
            const productCategory = document.getElementById('product-category').value;

            const orderData = {
                productName,
                quantity,
                deliveryAddress,
                customerTier,
                deliveryPriority,
                productCategory,
            };

            console.log('Order Data for Recommendation:', orderData);

            // --- SIMULATED BACKEND RESPONSE (FOR DEMONSTRATION ONLY) ---
            // Replace this with an actual `fetch` API call to your backend
            try {
                await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate network delay

                let recommendedWarehouse = null;
                let baseCost = Math.floor(Math.random() * 60) + 15;
                let deliveryTime = Math.floor(Math.random() * 4) + 1;

                const addressLower = deliveryAddress.toLowerCase();

                // More comprehensive AI/Logic Simulation with weighted conditions
                if (addressLower.includes('new york') || addressLower.includes('nj') || addressLower.includes('boston') || addressLower.includes('philadelphia')) {
                    recommendedWarehouse = {
                        name: 'East Coast Mega Fulfillment',
                        location: 'Florence, NJ',
                        stockLevel: 'Very High',
                        estimatedCost: `$${baseCost.toFixed(2)}`,
                        estimatedDeliveryDays: deliveryTime,
                        reasons: ['Optimal proximity to Northeast dense population', 'Extensive stock for fast-moving items', 'Dedicated express routes']
                    };
                } else if (addressLower.includes('los angeles') || addressLower.includes('ca') || addressLower.includes('san francisco') || addressLower.includes('seattle')) {
                    recommendedWarehouse = {
                        name: 'Pacific Northwest Hub',
                        location: 'Rialto, CA',
                        stockLevel: 'High',
                        estimatedCost: `$${(baseCost * 1.05).toFixed(2)}`,
                        estimatedDeliveryDays: deliveryTime + 1,
                        reasons: ['Strategic West Coast distribution point', 'Efficient port access for imports', 'Robust logistics for a vast region']
                    };
                } else if (addressLower.includes('chicago') || addressLower.includes('il') || addressLower.includes('detroit') || addressLower.includes('minneapolis')) {
                     recommendedWarehouse = {
                        name: 'Midwest Central Distribution',
                        location: 'Plainfield, IN',
                        stockLevel: 'High',
                        estimatedCost: `$${(baseCost * 0.95).toFixed(2)}`,
                        estimatedDeliveryDays: deliveryTime,
                        reasons: ['Centralized location for rapid nationwide reach', 'Excellent ground shipping infrastructure', 'High capacity for general merchandise']
                    };
                } else if (addressLower.includes('texas') || addressLower.includes('tx') || addressLower.includes('dallas') || addressLower.includes('houston') || addressLower.includes('austin')) {
                    recommendedWarehouse = {
                        name: 'Southwest Logistics Powerhouse',
                        location: 'Baytown, TX',
                        stockLevel: 'Very High',
                        estimatedCost: `$${(baseCost * 0.88).toFixed(2)}`,
                        estimatedDeliveryDays: deliveryTime,
                        reasons: ['Massive capacity for bulk orders and freight', 'Lowest cost for large shipments in the region', 'Direct access to major highways']
                    };
                } else if (addressLower.includes('florida') || addressLower.includes('fl') || addressLower.includes('miami') || addressLower.includes('atlanta')) {
                     recommendedWarehouse = {
                        name: 'Southeast Gateway Center',
                        location: 'Lakeland, FL',
                        stockLevel: 'Good',
                        estimatedCost: `$${(baseCost * 1.03).toFixed(2)}`,
                        estimatedDeliveryDays: deliveryTime + 1,
                        reasons: ['Primary hub for the rapidly growing Southeast market', 'Specialized handling for seasonal products', 'Efficient coastal distribution']
                    };
                } else {
                    recommendedWarehouse = {
                        name: 'National Cross-Dock Facility',
                        location: 'Olive Branch, MS',
                        stockLevel: 'Good',
                        estimatedCost: `$${(baseCost * 1.0).toFixed(2)}`,
                        estimatedDeliveryDays: deliveryTime + 1,
                        reasons: ['Strategically located for balanced national distribution', 'Reliable stock levels for diverse product range', 'Adaptive to varying order sizes']
                    };
                }

                // Further refine based on other factors (simulating AI decision weighting)
                if (customerTier === 'prime') {
                    if (recommendedWarehouse.estimatedDeliveryDays > 1) {
                        recommendedWarehouse.estimatedDeliveryDays = Math.max(1, recommendedWarehouse.estimatedDeliveryDays - 1); // Prioritize speed
                        recommendedWarehouse.estimatedCost = `$${(parseFloat(recommendedWarehouse.estimatedCost.substring(1)) * 1.1).toFixed(2)}`; // May incur slight cost
                        recommendedWarehouse.reasons.unshift('Prioritized for Prime Customer Tier: Expedited processing');
                    }
                } else if (customerTier === 'wholesale') {
                    recommendedWarehouse.estimatedCost = `$${(parseFloat(recommendedWarehouse.estimatedCost.substring(1)) * 0.8).toFixed(2)}`; // Significant discount
                    recommendedWarehouse.reasons.unshift('Wholesale customer: Bulk pricing optimization applied');
                }

                if (deliveryPriority === 'urgent') {
                     recommendedWarehouse.estimatedDeliveryDays = 1; // Force 1-day delivery
                     recommendedWarehouse.estimatedCost = `$${(parseFloat(recommendedWarehouse.estimatedCost.substring(1)) * 1.4).toFixed(2)}`; // High cost
                     recommendedWarehouse.reasons.unshift('Urgent delivery requested: Fastest possible routing and carrier selected');
                } else if (deliveryPriority === 'express') {
                    if (recommendedWarehouse.estimatedDeliveryDays > 1) {
                        recommendedWarehouse.estimatedDeliveryDays = Math.max(1, recommendedWarehouse.estimatedDeliveryDays - 0.5); // Faster
                        recommendedWarehouse.estimatedCost = `$${(parseFloat(recommendedWarehouse.estimatedCost.substring(1)) * 1.15).toFixed(2)}`;
                        recommendedWarehouse.reasons.unshift('Express delivery: Faster transit time via premium service');
                    }
                }

                if (productCategory === 'perishable' || productCategory === 'fragile') {
                    // Simulate routing to a specialized warehouse if necessary and available
                    if (productCategory === 'perishable' && recommendedWarehouse.name !== 'Central Perishable Hub') {
                        recommendedWarehouse = {
                            name: 'Central Perishable Hub',
                            location: 'Kansas City, MO (Climate-Controlled)',
                            stockLevel: 'Very High',
                            estimatedCost: `$${(parseFloat(recommendedWarehouse.estimatedCost.substring(1)) * 1.25).toFixed(2)}`,
                            estimatedDeliveryDays: Math.max(1, deliveryTime),
                            reasons: ['Selected for specialized climate-controlled facilities', 'Expert handling of perishable goods']
                        };
                    } else if (productCategory === 'fragile') {
                        recommendedWarehouse.reasons.unshift('Special handling procedures for fragile items implemented');
                    }
                }

                if (quantity > 75) {
                    recommendedWarehouse.reasons.push('Optimized for large volume orders: Efficient pallet loading and routing');
                    recommendedWarehouse.estimatedCost = `$${(parseFloat(recommendedWarehouse.estimatedCost.substring(1)) * 0.82).toFixed(2)}`; // More discount for larger bulk
                }


                displayRecommendation(recommendedWarehouse);

            } catch (error) {
                console.error('Error simulating recommendation:', error);
                recommendationResultDiv.innerHTML = '<p class="error-message">Failed to get recommendation. Please check your inputs or try again.</p>';
            } finally {
                loadingSpinner.style.display = 'none';
                getRecommendationBtn.disabled = false;
            }
        } else {
            recommendationResultDiv.innerHTML = '<p class="placeholder">Please fill all required fields to get an instant recommendation.</p>';
            loadingSpinner.style.display = 'none';
            getRecommendationBtn.disabled = false;
        }
    };

    // --- Entrance Animations for Sections ---
    // Using Intersection Observer for a smooth reveal as user scrolls
    const sections = document.querySelectorAll('.animate-section');
    const observerOptions = {
        root: null, // relative to the viewport
        rootMargin: '0px',
        threshold: 0.1 // 10% of the section must be visible to trigger
    };

    const sectionObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('in-view');
                observer.unobserve(entry.target); // Stop observing once animated
            }
        });
    }, observerOptions);

    sections.forEach(section => {
        sectionObserver.observe(section);
    });

    // --- Event Listeners for Automatic Triggering ---
    inputFields.forEach(field => {
        field.addEventListener('input', () => {
            clearTimeout(recommendationTimer);
            loadingSpinner.style.display = 'none';
            recommendationResultDiv.innerHTML = '<p class="placeholder">Typing... recommendation will update automatically.</p>';
            recommendationTimer = setTimeout(triggerRecommendation, debounceDelay);
        });
        if (field.tagName === 'SELECT') {
            field.addEventListener('change', () => {
                clearTimeout(recommendationTimer);
                recommendationTimer = setTimeout(triggerRecommendation, debounceDelay);
            });
        }
    });

    // Event listener for the explicit button click (manual trigger)
    recommendationForm.addEventListener('submit', (event) => {
        event.preventDefault();
        clearTimeout(recommendationTimer); // Clear any pending automatic trigger
        triggerRecommendation(); // Force immediate recommendation
    });

    // --- Function to Display Recommendation ---
    function displayRecommendation(recommendation) {
        if (!recommendation) {
            recommendationResultDiv.innerHTML = '<p class="placeholder">No specific recommendation found for these details.</p>';
            return;
        }

        let reasonsHtml = '';
        if (recommendation.reasons && recommendation.reasons.length > 0) {
            reasonsHtml = '<h4>Reasons for Recommendation:</h4><ul>';
            recommendation.reasons.forEach(reason => {
                reasonsHtml += `<li>${reason}</li>`;
            });
            reasonsHtml += '</ul>';
        }

        // Apply animation class to the content wrapped inside recommendationResultDiv
        recommendationResultDiv.innerHTML = `
            <div class="recommendation-content-enter">
                <h3>${recommendation.name}</h3>
                <p><strong>Location:</strong> ${recommendation.location}</p>
                <p><strong>Current Stock Level:</strong> <span style="font-weight: bold; color: ${getStockColor(recommendation.stockLevel)};">${recommendation.stockLevel}</span></p>
                <p><strong>Estimated Cost:</strong> ${recommendation.estimatedCost}</p>
                <p><strong>Estimated Delivery:</strong> ${recommendation.estimatedDeliveryDays} day(s)</p>
                ${reasonsHtml}
            </div>
        `;
    }

    // Helper function for stock level color coding
    function getStockColor(stockLevel) {
        switch (stockLevel.toLowerCase()) {
            case 'high':
            case 'very high':
                return '#28a745'; /* Green */
            case 'good':
                return '#17a2b8'; /* Info blue/teal */
            case 'medium':
                return '#ffc107'; /* Yellow/Orange */
            case 'low':
                return '#dc3545'; /* Red */
            default:
                return '#6c757d'; /* Grey */
        }
    }
});