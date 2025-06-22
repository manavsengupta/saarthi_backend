from django.shortcuts import render, get_object_or_404, redirect
from django.urls import reverse
from django.utils import timezone
from .models import Retailer, Product, Order, ProductAnalytics
from django.db.models import Sum, F
from django.contrib import messages
import pandas as pd
import numpy as np

from sklearn.linear_model import LinearRegression
from .models import Product, Order, ProductAnalytics

def analyze_product(product):
    # Get all orders for this product
    orders = Order.objects.filter(product=product).order_by('ordered_at')
    if not orders.exists():
        return

    # Prepare daily sales data
    df = pd.DataFrame(list(orders.values('ordered_at', 'quantity')))
    df['date'] = pd.to_datetime(df['ordered_at']).dt.date
    daily_sales = df.groupby('date')['quantity'].sum().reset_index()

    # Prepare data for regression: X = day index, y = quantity
    daily_sales['day_idx'] = np.arange(len(daily_sales))
    X = daily_sales[['day_idx']]
    y = daily_sales['quantity']

    # Predict next 7 days sales using linear regression
    model = LinearRegression()
    model.fit(X, y)
    next_days = np.arange(len(daily_sales), len(daily_sales) + 7).reshape(-1, 1)
    predicted_sales = model.predict(next_days)
    predicted_stock = int(np.round(predicted_sales.sum()))

    # Determine overstock/understock
    overstocked = product.stock > predicted_stock * 1.5
    understocked = product.stock < predicted_stock * 0.7

    # Save or update analytics
    analytics, _ = ProductAnalytics.objects.get_or_create(product=product)
    analytics.predicted_stock = predicted_stock
    analytics.overstocked = overstocked
    analytics.understocked = understocked
    analytics.notes = (
        f"Predicted demand for next 7 days: {predicted_stock}. "
        f"{'Overstocked.' if overstocked else ''} {'Understocked.' if understocked else ''}"
    )
    analytics.save()



def retailer_list(request):
    if request.method == 'POST':
        name = request.POST['name']
        contact = request.POST.get('contact', '')
        Retailer.objects.create(name=name, contact=contact)
        messages.success(request, "Retailer added!")
        return redirect('retailer_list')
    retailers = Retailer.objects.all()
    return render(request, 'inventory/retailer_list.html', {'retailers': retailers})

def product_list(request, retailer_id):
    retailer = get_object_or_404(Retailer, id=retailer_id)
    products = retailer.products.all()
    return render(request, 'inventory/product_list.html', {'retailer': retailer, 'products': products})

def add_product(request, retailer_id):
    retailer = get_object_or_404(Retailer, id=retailer_id)
    if request.method == 'POST':
        name = request.POST['name']
        description = request.POST.get('description', '')
        price = request.POST['price']
        stock = request.POST['stock']
        Product.objects.create(
            retailer=retailer,
            name=name,
            description=description,
            price=price,
            stock=stock
        )
        messages.success(request, "Product added!")
        return redirect(reverse('product_list', args=[retailer.id]))
    return render(request, 'inventory/add_product.html', {'retailer': retailer})

def simulate_order(request, product_id):
    product = get_object_or_404(Product, id=product_id)
    if request.method == 'POST':
        quantity = int(request.POST['quantity'])
        order_source = request.POST['order_source']
        if quantity > product.stock:
            messages.error(request, "Not enough stock!")
        else:
            Order.objects.create(
                product=product,
                quantity=quantity,
                order_source=order_source,
                ordered_at=timezone.now()
            )
            product.stock = F('stock') - quantity
            product.save()
            product.refresh_from_db()  # <-- Add this line

            # --- ML analysis after order ---
            analyze_product(product)
            messages.success(request, "Order placed!")
        return redirect(reverse('product_list', args=[product.retailer.id]))
    return render(request, 'inventory/simulate_order.html', {'product': product})
import json
from django.utils.dateformat import DateFormat

def product_analytics(request, product_id):
    product = get_object_or_404(Product, id=product_id)
    orders = product.orders.order_by('ordered_at')
    analytics = getattr(product, 'analytics', None)
    total_sold = orders.aggregate(total=Sum('quantity'))['total'] or 0
    suggestion = None
    if total_sold > 0:
        avg_daily = total_sold / max((timezone.now() - orders.last().ordered_at).days, 1)
        suggestion = int(avg_daily * 7)  # Suggest 1 week of stock

    # --- Prepare chart data ---
    # Sales Trend
    sales_by_date = {}
    for order in orders:
        date_str = DateFormat(order.ordered_at).format('Y-m-d')
        sales_by_date[date_str] = sales_by_date.get(date_str, 0) + order.quantity
    sales_labels = list(sales_by_date.keys())
    sales_values = list(sales_by_date.values())

    # Order Sources
    source_map = {}
    for order in orders:
        src = order.get_order_source_display()
        source_map[src] = source_map.get(src, 0) + order.quantity
    source_labels = list(source_map.keys())
    source_values = list(source_map.values())

    context = {
        'product': product,
        'orders': orders,
        'analytics': analytics,
        'suggestion': suggestion,
        'total_sold': total_sold,
        'sales_labels': json.dumps(sales_labels),
        'sales_values': json.dumps(sales_values),
        'source_labels': json.dumps(source_labels),
        'source_values': json.dumps(source_values),
    }
    return render(request, 'inventory/product_analytics.html', context)