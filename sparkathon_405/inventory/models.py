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