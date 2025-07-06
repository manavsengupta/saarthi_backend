from django.db import models

class Retailer(models.Model):
    name = models.CharField(max_length=100)
    contact = models.CharField(max_length=100, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name

class Product(models.Model):
    retailer = models.ForeignKey(Retailer, on_delete=models.CASCADE, related_name='products')
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    stock = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.retailer.name})"

class Order(models.Model):
    ORDER_SOURCES = [
        ('app', 'App'),
        ('website', 'Website'),
        ('phone', 'Phone'),
        ('walkin', 'Walk-in'),
        ('other', 'Other'),
    ]
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='orders')
    quantity = models.PositiveIntegerField()
    order_source = models.CharField(max_length=20, choices=ORDER_SOURCES)
    ordered_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Order of {self.quantity} x {self.product.name} from {self.get_order_source_display()}"

# For future: Model to store analytics, ML predictions, or stock recommendations
class ProductAnalytics(models.Model):
    product = models.OneToOneField(Product, on_delete=models.CASCADE, related_name='analytics')
    predicted_stock = models.IntegerField(null=True, blank=True)
    overstocked = models.BooleanField(default=False)
    understocked = models.BooleanField(default=False)
    last_updated = models.DateTimeField(auto_now=True)
    notes = models.TextField(blank=True)

    def __str__(self):
        return f"Analytics for {self.product.name}"
    

from django.db import models
class DeliveryPerson(models.Model):
    STATUS_CHOICES = [
        ('active', 'Active'),
        ('inactive', 'Inactive'),
        ('accident', 'Accident'),
        ('offline', 'Offline'),
    ]
    name = models.CharField(max_length=100)
    current_lat = models.FloatField(null=True, blank=True)
    current_lng = models.FloatField(null=True, blank=True)
    velocity = models.FloatField(default=0)  # m/s
    accel = models.FloatField(default=0)     # m/s^2
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')
    last_update = models.DateTimeField(auto_now=True)
    mimic_accident = models.BooleanField(default=False)  # <-- Add this line
    accident_flag = models.BooleanField(default=False)
    accident_time = models.DateTimeField(null=True, blank=True)
    def __str__(self):
        return self.name
class Store(models.Model):
    name = models.CharField(max_length=100)
    address = models.TextField(blank=True)
    latitude = models.FloatField()
    longitude = models.FloatField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name

class Drone(models.Model):
    STATUS_CHOICES = [
        ('idle', 'Idle'),
        ('charging', 'Charging'),
        ('in_flight', 'In Flight'),
        ('maintenance', 'Maintenance'),
        ('offline', 'Offline'),
    ]
    name = models.CharField(max_length=100)
    max_weight_kg = models.FloatField()
    battery_capacity_mah = models.IntegerField()
    current_battery_mah = models.IntegerField()
    speed_kmph = models.FloatField()
    max_flight_time_min = models.IntegerField()
    altitude_m = models.FloatField(default=0)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='idle')
    current_lat = models.FloatField(null=True, blank=True)
    current_lng = models.FloatField(null=True, blank=True)
    last_update = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name

class Delivery(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('assigned', 'Assigned'),
        ('in_progress', 'In Progress'),
        ('delivered', 'Delivered'),
        ('failed', 'Failed'),
        ('cancelled', 'Cancelled'),
    ]
    drone = models.ForeignKey(Drone, on_delete=models.SET_NULL, null=True, blank=True, related_name='deliveries')
    source_store = models.ForeignKey(Store, on_delete=models.CASCADE, related_name='outgoing_deliveries')
    destination_lat = models.FloatField()
    destination_lng = models.FloatField()
    package_weight_kg = models.FloatField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    route = models.JSONField(blank=True, null=True)  # List of waypoints, etc.
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    estimated_time_min = models.FloatField(null=True, blank=True)
    actual_time_min = models.FloatField(null=True, blank=True)
    notes = models.TextField(blank=True)
    assigned_to = models.ForeignKey('DeliveryPerson', on_delete=models.SET_NULL, null=True, blank=True, related_name='deliveries')  # NEW
    mode = models.CharField(max_length=20, choices=[('drone', 'Drone'), ('biker', 'Biker')], default='biker')  # NEW
    suggested_mode = models.CharField(
        max_length=20,
        choices=[('drone', 'Drone'), ('biker', 'Biker')],
        default='biker'
    )
    
    
    def __str__(self):
        return f"Delivery #{self.id} ({self.get_status_display()})"

# Optional: For storing live telemetry if you want to track history
class DroneTelemetry(models.Model):
    drone = models.ForeignKey(Drone, on_delete=models.CASCADE, related_name='telemetry')
    timestamp = models.DateTimeField(auto_now_add=True)
    latitude = models.FloatField()
    longitude = models.FloatField()
    altitude_m = models.FloatField()
    battery_mah = models.IntegerField()
    speed_kmph = models.FloatField()
    delivery = models.ForeignKey(Delivery, on_delete=models.SET_NULL, null=True, blank=True)

    def __str__(self):
        return f"{self.drone.name} @ {self.timestamp}"
from django.db import models

class SmartDropPoint(models.Model):
    name = models.CharField(max_length=100)
    latitude = models.FloatField()
    longitude = models.FloatField()
    added_by = models.ForeignKey('Retailer', on_delete=models.CASCADE, related_name='smartdrop_points')

    def __str__(self):
        return self.name
    
class AccidentEvent(models.Model):
    delivery = models.ForeignKey(Delivery, on_delete=models.CASCADE, related_name='accidents')
    person = models.ForeignKey(DeliveryPerson, on_delete=models.CASCADE, related_name='accidents')
    timestamp = models.DateTimeField(auto_now_add=True)
    details = models.TextField(blank=True)

    def __str__(self):
        return f"Accident for {self.person.name} at {self.timestamp}"
    
from django.db import models

class Truck(models.Model):
    name = models.CharField(max_length=100)
    session_id = models.CharField(max_length=100, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    photo = models.ImageField(upload_to='truck_photos/', blank=True, null=True)  # <-- Add this line
    # Add location fields if needed

class Parcel(models.Model):
    truck = models.ForeignKey(Truck, on_delete=models.CASCADE, related_name='parcels')
    row = models.IntegerField()
    col = models.IntegerField()
    code = models.CharField(max_length=100, blank=True)
    verified = models.BooleanField(default=False)
    tampered = models.BooleanField(default=False)
    info = models.CharField(max_length=200, blank=True)
    scan_time = models.DateTimeField(blank=True, null=True)
    photo = models.ImageField(upload_to='parcel_photos/', blank=True, null=True)
    
