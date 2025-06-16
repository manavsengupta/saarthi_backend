document.addEventListener('DOMContentLoaded', () => {
    // Get user type selection buttons
    const retailerBtn = document.getElementById('retailerBtn');
    const deliveryPartnerBtn = document.getElementById('deliveryPartnerBtn');
    const customerBtn = document.getElementById('customerBtn');

    // Get form sections
    const retailerSection = document.getElementById('retailerSection');
    const deliveryPartnerSection = document.getElementById('deliveryPartnerSection');
    const customerSection = document.getElementById('customerSection');

    // Get login/signup toggles for each section
    const retailerLoginToggle = document.getElementById('retailerLoginToggle');
    const retailerSignupToggle = document.getElementById('retailerSignupToggle');
    const deliveryPartnerLoginToggle = document.getElementById('deliveryPartnerLoginToggle');
    const deliveryPartnerSignupToggle = document.getElementById('deliveryPartnerSignupToggle');
    const customerLoginToggle = document.getElementById('customerLoginToggle');
    const customerSignupToggle = document.getElementById('customerSignupToggle');

    // Get login/signup forms for each section
    const retailerLoginForm = document.getElementById('retailerLoginForm');
    const retailerSignupForm = document.getElementById('retailerSignupForm');
    const deliveryPartnerLoginForm = document.getElementById('deliveryPartnerLoginForm');
    const deliveryPartnerSignupForm = document.getElementById('deliveryPartnerSignupForm');
    const customerLoginForm = document.getElementById('customerLoginForm');
    const customerSignupForm = document.getElementById('customerSignupForm');

    // Delivery Partner specific fields
    const fulltimeRadio = document.querySelector('input[name="deliveryType"][value="fulltime"]');
    const parttimeRadio = document.querySelector('input[name="deliveryType"][value="parttime"]');
    const fulltimeFields = document.getElementById('fulltimeFields');
    const parttimeFields = document.getElementById('parttimeFields');

    // Custom Notification Element
    const customNotification = document.getElementById('customNotification');
    let notificationTimeout; // To manage the auto-hide timeout

    // --- Function to show custom notification ---
    function showCustomNotification(message, type = 'info', duration = 3000) {
        // Clear previous timeout if any
        if (notificationTimeout) {
            clearTimeout(notificationTimeout);
            customNotification.classList.remove('show'); // Hide immediately to reset animation
        }

        // Reset classes
        customNotification.className = 'custom-notification';
        customNotification.classList.add(type);

        // Set message and icon
        let iconHtml = '';
        if (type === 'success') iconHtml = '<i class="fas fa-check-circle"></i>';
        else if (type === 'error') iconHtml = '<i class="fas fa-times-circle"></i>';
        else if (type === 'warning') iconHtml = '<i class="fas fa-exclamation-triangle"></i>';
        else iconHtml = '<i class="fas fa-info-circle"></i>';

        customNotification.innerHTML = iconHtml + message;
        customNotification.classList.add('show');

        // Hide after duration
        notificationTimeout = setTimeout(() => {
            customNotification.classList.remove('show');
        }, duration);
    }

    // --- Function to show a specific user section with animation ---
    function showSection(sectionToShow, animationClass = 'animate__fadeIn') {
        // Remove animation classes from all sections before hiding
        [retailerSection, deliveryPartnerSection, customerSection].forEach(section => {
            section.classList.remove('active', 'animate__fadeIn', 'animate__slideInUp', 'animate__bounceIn'); // Remove all potential animation classes
            section.classList.add('hidden');
        });

        // Apply animation and show the target section
        sectionToShow.classList.remove('hidden');
        sectionToShow.classList.add('active', 'animate__animated', animationClass);

        // Ensure forms inside the activated section also animate if not already active
        const activeForm = sectionToShow.querySelector('.login-form.active') || sectionToShow.querySelector('.signup-form.active');
        if (activeForm) {
            activeForm.classList.add('animate__animated', 'animate__fadeIn');
        }
    }

    // --- Function to activate a user type button ---
    function activateUserTypeButton(buttonToActivate) {
        [retailerBtn, deliveryPartnerBtn, customerBtn].forEach(btn => {
            btn.classList.remove('active');
        });
        buttonToActivate.classList.add('active');
    }

    // --- Function to toggle login/signup forms within a section with animation ---
    function toggleForm(loginForm, signupForm, loginToggle, signupToggle, showLogin) {
        // Remove existing animation classes first
        loginForm.classList.remove('animate__animated', 'animate__fadeIn', 'animate__slideInRight');
        signupForm.classList.remove('animate__animated', 'animate__fadeIn', 'animate__slideInLeft');

        // Reset mobile OTP sections when switching forms
        resetMobileOtpSections(loginForm);
        resetMobileOtpSections(signupForm);


        if (showLogin) {
            signupForm.classList.add('hidden');
            loginForm.classList.remove('hidden');
            loginForm.classList.add('animate__animated', 'animate__fadeIn'); // Fade in login
            loginToggle.classList.add('active');
            signupToggle.classList.remove('active');
        } else {
            loginForm.classList.add('hidden');
            signupForm.classList.remove('hidden');
            signupForm.classList.add('animate__animated', 'animate__fadeIn'); // Fade in signup
            loginToggle.classList.remove('active');
            signupToggle.classList.add('active');
        }
        // For delivery partner signup, ensure correct fields are shown on toggle
        if (signupForm === deliveryPartnerSignupForm) {
             toggleDeliveryPartnerFields();
        }
    }

    // --- Event Listeners for User Type Selection ---
    retailerBtn.addEventListener('click', () => {
        showSection(retailerSection, 'animate__fadeIn'); // Use fadeIn for section switch
        activateUserTypeButton(retailerBtn);
        toggleForm(retailerLoginForm, retailerSignupForm, retailerLoginToggle, retailerSignupToggle, true); // Default to login
    });

    deliveryPartnerBtn.addEventListener('click', () => {
        showSection(deliveryPartnerSection, 'animate__fadeIn');
        activateUserTypeButton(deliveryPartnerBtn);
        // Default to login for delivery partner, then ensure signup specific fields are reset
        toggleForm(deliveryPartnerLoginForm, deliveryPartnerSignupForm, deliveryPartnerLoginToggle, deliveryPartnerSignupToggle, true);
    });

    customerBtn.addEventListener('click', () => {
        showSection(customerSection, 'animate__fadeIn');
        activateUserTypeButton(customerBtn);
        toggleForm(customerLoginForm, customerSignupForm, customerLoginToggle, customerSignupToggle, true); // Default to login
    });

    // --- Event Listeners for Login/Signup Toggles (within each section) ---
    retailerLoginToggle.addEventListener('click', () => {
        toggleForm(retailerLoginForm, retailerSignupForm, retailerLoginToggle, retailerSignupToggle, true);
    });
    retailerSignupToggle.addEventListener('click', () => {
        toggleForm(retailerLoginForm, retailerSignupForm, retailerLoginToggle, retailerSignupToggle, false);
    });

    deliveryPartnerLoginToggle.addEventListener('click', () => {
        toggleForm(deliveryPartnerLoginForm, deliveryPartnerSignupForm, deliveryPartnerLoginToggle, deliveryPartnerSignupToggle, true);
    });
    deliveryPartnerSignupToggle.addEventListener('click', () => {
        toggleForm(deliveryPartnerLoginForm, deliveryPartnerSignupForm, deliveryPartnerLoginToggle, deliveryPartnerSignupToggle, false);
    });

    customerLoginToggle.addEventListener('click', () => {
        toggleForm(customerLoginForm, customerSignupForm, customerLoginToggle, customerSignupToggle, true);
    });
    customerSignupToggle.addEventListener('click', () => {
        toggleForm(customerLoginForm, customerSignupForm, customerLoginToggle, customerSignupToggle, false);
    });

    // --- Form Submission Handlers (Frontend only - no backend logic here) ---
    document.querySelectorAll('form').forEach(form => {
        form.addEventListener('submit', (event) => {
            event.preventDefault(); // Prevent default form submission

            const formData = new FormData(event.target);
            const data = {};
            formData.forEach((value, key) => {
                data[key] = value;
            });

            console.log(`Form submitted for: ${event.target.id}`, data);
            // Keep native alert for traditional form submission confirmation
            alert(`Traditional form submitted for ${event.target.id}! (Check console for data)\n\nIn a real app, this would send data to your backend for authentication/registration.`);
            // In a real application, you would send this 'data' to your backend server
            // using fetch() or XMLHttpRequest for authentication/registration.
            event.target.reset(); // Clear the form fields after submission
            resetMobileOtpSections(event.target); // Reset mobile section if active
        });
    });

    // --- Social Login Handlers ---
    document.querySelectorAll('.social-btn').forEach(button => {
        button.addEventListener('click', (event) => {
            const userType = event.target.dataset.userType;
            const loginType = event.target.classList.contains('google-btn') ? 'Google' : 'Facebook';
            const formType = event.target.closest('form').classList.contains('login-form') ? 'Login' : 'Signup';

            const message = `Initiating ${formType} with ${loginType} for ${userType}. Please wait...`;
            showCustomNotification(message, 'info', 4000); // Show info notification

            console.log(`${formType} with ${loginType} for ${userType}`);
            // In a real app, this would initiate the OAuth flow.
            // Example for Google: window.location.href = 'https://accounts.google.com/o/oauth2/v2/auth?...';
        });
    });

    // --- Mobile Number OTP Handlers ---
    let otpTimerInterval;

    function startOtpTimer(timerElement, sendOtpBtn, resendOtpBtn) {
        let timeLeft = 60;
        timerElement.textContent = `${timeLeft}s`;
        timerElement.classList.remove('hidden');
        sendOtpBtn.disabled = true; // Disable send OTP button during countdown
        sendOtpBtn.classList.add('hidden'); // Hide send OTP button
        resendOtpBtn.classList.add('hidden'); // Ensure resend is hidden when timer starts

        otpTimerInterval = setInterval(() => {
            timeLeft--;
            timerElement.textContent = `${timeLeft}s`;
            if (timeLeft <= 0) {
                clearInterval(otpTimerInterval);
                timerElement.classList.add('hidden');
                resendOtpBtn.classList.remove('hidden'); // Show resend button
                sendOtpBtn.disabled = false; // Re-enable if resend isn't pressed (though it's hidden)
                showCustomNotification("OTP expired or not received. You can resend now.", 'warning', 5000);
            }
        }, 1000);
    }

    function resetMobileOtpSections(formElement) {
        formElement.querySelectorAll('.mobile-login-container').forEach(container => {
            const mobileInput = container.querySelector('.mobile-input');
            const sendOtpBtn = container.querySelector('.send-otp-btn');
            const otpSection = container.querySelector('.otp-verification-section');
            const otpInput = container.querySelector('.otp-input');
            const otpTimer = container.querySelector('.otp-timer');
            const resendOtpBtn = container.querySelector('.resend-otp-btn');

            if (otpTimerInterval) {
                clearInterval(otpTimerInterval);
            }

            if (mobileInput) {
                mobileInput.disabled = false;
                mobileInput.value = ''; // Clear mobile input
            }
            if (sendOtpBtn) sendOtpBtn.classList.remove('hidden');
            if (otpSection) {
                otpSection.classList.add('hidden');
                otpSection.classList.remove('animate__animated', 'animate__fadeIn'); // Remove animation classes
            }
            if (otpInput) otpInput.value = ''; // Clear OTP input
            if (otpTimer) otpTimer.classList.add('hidden');
            if (resendOtpBtn) resendOtpBtn.classList.add('hidden'); // Hide resend button
        });
    }

    document.querySelectorAll('.send-otp-btn, .resend-otp-btn').forEach(button => {
        button.addEventListener('click', (event) => {
            const container = event.target.closest('.mobile-login-container');
            const mobileInput = container.querySelector('.mobile-input');
            const otpSection = container.querySelector('.otp-verification-section');
            const otpTimer = container.querySelector('.otp-timer');
            const sendOtpBtn = container.querySelector('.send-otp-btn');
            const resendOtpBtn = container.querySelector('.resend-otp-btn'); // Get resend button

            const userType = event.target.dataset.userType;
            const formType = event.target.closest('form').classList.contains('login-form') ? 'Login' : 'Signup';

            if (mobileInput.checkValidity()) {
                mobileInput.disabled = true; // Disable mobile input after sending OTP
                event.target.classList.add('hidden'); // Hide the clicked button (send or resend)
                otpSection.classList.remove('hidden'); // Show OTP verification section
                otpSection.classList.add('animate__animated', 'animate__fadeIn'); // Add animation

                startOtpTimer(otpTimer, sendOtpBtn, resendOtpBtn); // Start the timer

                const message = `OTP sent to ${mobileInput.value.slice(0, 3)}*****${mobileInput.value.slice(-2)} for ${userType} ${formType}!`;
                showCustomNotification(message, 'info', 4000);
                console.log(`OTP sent to ${mobileInput.value} for ${userType} ${formType}`);
                // In a real app, you would send an API request to your backend to send an OTP.
            } else {
                // Keep native alert for invalid mobile number for immediate feedback
                alert("Please enter a valid 10-digit mobile number.");
                mobileInput.reportValidity(); // Show browser's validation message
            }
        });
    });

    document.querySelectorAll('.verify-otp-btn').forEach(button => {
        button.addEventListener('click', (event) => {
            const container = event.target.closest('.mobile-login-container');
            const mobileInput = container.querySelector('.mobile-input');
            const otpInput = container.querySelector('.otp-input');
            const userType = event.target.dataset.userType;
            const formType = event.target.closest('form').classList.contains('login-form') ? 'Login' : 'Signup';

            if (otpInput.checkValidity()) {
                const message = `OTP ${otpInput.value} verified for ${mobileInput.value.slice(0, 3)}*****${mobileInput.value.slice(-2)} (${userType} ${formType})!`;
                showCustomNotification(message, 'success', 5000); // Show success notification
                console.log(`OTP ${otpInput.value} verified for ${mobileInput.value} (${userType} ${formType})`);
                // In a real app, you would send an API request to your backend to verify the OTP.
                // If successful, you'd proceed with login/signup.
                resetMobileOtpSections(container.closest('form')); // Reset after verification
            } else {
                // Keep native alert for invalid OTP for immediate feedback
                alert("Please enter a valid OTP (4-6 digits).");
                otpInput.reportValidity(); // Show browser's validation message
            }
        });
    });

    // --- Delivery Partner Type Toggle Logic ---
    function toggleDeliveryPartnerFields() {
        if (fulltimeRadio.checked) {
            fulltimeFields.classList.remove('hidden');
            parttimeFields.classList.add('hidden');
            // Make full-time specific field required, part-time not
            document.getElementById('deliveryPartnerSignupVehicle').required = true;
            document.getElementById('deliveryPartnerSignupHours').required = false;
        } else if (parttimeRadio.checked) {
            fulltimeFields.classList.add('hidden');
            parttimeFields.classList.remove('hidden');
            // Make part-time specific field required, full-time not
            document.getElementById('deliveryPartnerSignupVehicle').required = false;
            document.getElementById('deliveryPartnerSignupHours').required = true;
        }
    }

    if (fulltimeRadio && parttimeRadio) { // Ensure these elements exist before adding listeners
        fulltimeRadio.addEventListener('change', toggleDeliveryPartnerFields);
        parttimeRadio.addEventListener('change', toggleDeliveryPartnerFields);
    }


    // Initialize: show retailer section by default with an initial animation
    showSection(retailerSection, 'animate__fadeIn');
    activateUserTypeButton(retailerBtn);
    toggleForm(retailerLoginForm, retailerSignupForm, retailerLoginToggle, retailerSignupToggle, true);
});