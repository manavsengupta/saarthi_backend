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

    # Add day-of-week feature for weekly seasonality
    daily_sales['day_of_week'] = pd.to_datetime(daily_sales['date']).dt.dayofweek
    daily_sales['day_idx'] = np.arange(len(daily_sales))

    # Use rolling average for smoothing (window=3)
    daily_sales['quantity_smooth'] = daily_sales['quantity'].rolling(window=3, min_periods=1).mean()

    # Prepare features and target
    X = daily_sales[['day_idx', 'day_of_week']]
    y = daily_sales['quantity_smooth']

    # If not enough data, fallback to mean
    if len(daily_sales) < 4:
        predicted_stock = int(np.round(y.mean() * 7))
        std = int(np.round(y.std())) if len(y) > 1 else 0
    else:
        # Fit regression model
        model = LinearRegression()
        model.fit(X, y)
        # Predict for next 7 days (with correct day-of-week)
        last_idx = daily_sales['day_idx'].iloc[-1]
        next_days_idx = np.arange(last_idx + 1, last_idx + 8)
        next_days_dow = [(pd.to_datetime(daily_sales['date'].iloc[-1]) + pd.Timedelta(days=i)).dayofweek for i in range(1, 8)]
        X_pred = np.column_stack([next_days_idx, next_days_dow])
        predicted_sales = model.predict(X_pred)
        predicted_sales = np.clip(predicted_sales, 0, None)  # No negative sales
        predicted_stock = int(np.round(predicted_sales.sum()))
        std = int(np.round(np.std(predicted_sales)))

    # Determine overstock/understock with confidence interval
    overstocked = product.stock > predicted_stock + std
    understocked = product.stock < max(predicted_stock - std, 0)

    # Save or update analytics
    analytics, _ = ProductAnalytics.objects.get_or_create(product=product)
    analytics.predicted_stock = predicted_stock
    analytics.overstocked = overstocked
    analytics.understocked = understocked
    analytics.notes = (
        f"Predicted demand for next 7 days: {predicted_stock} (±{std}). "
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
import io
import pandas as pd
from django.http import HttpResponse
def download_product_report(request, product_id):
    product = get_object_or_404(Product, id=product_id)
    orders = product.orders.order_by('ordered_at')
    analytics = getattr(product, 'analytics', None)

    # Prepare order data
    order_data = [{
        'Date': order.ordered_at.strftime('%Y-%m-%d %H:%M'),
        'Quantity': order.quantity,
        'Order Source': order.get_order_source_display(),
    } for order in orders]
    df_orders = pd.DataFrame(order_data)

    # Prepare summary/insights
    total_sold = orders.aggregate(total=Sum('quantity'))['total'] or 0
    last_order = orders.last()
    days_since_last_sale = (timezone.now() - last_order.ordered_at).days if last_order else None

    # --- AI Suggestion based on AI prediction only ---
    pred = analytics.predicted_stock if analytics and analytics.predicted_stock is not None else None
    if pred is not None and pred > 0:
        demand_stock_ratio = pred / product.stock if product.stock > 0 else 0
        if product.stock > pred * 10:
            ai_suggestion = "🚩 Drop Product: Stock is much higher than AI-predicted demand. Consider discontinuing or heavy discounting."
        elif demand_stock_ratio < 0.1:
            ai_suggestion = "😕 Poor Choice: Demand is very low compared to stock. Consider alternatives."
        elif demand_stock_ratio < 0.3:
            ai_suggestion = "🟡 Okay Choice: Demand is low, monitor closely or promote."
        elif demand_stock_ratio < 0.7:
            ai_suggestion = "🟢 Good Choice: Demand is decent, but you can optimize stock."
        elif demand_stock_ratio < 1.2:
            ai_suggestion = "💎 Great Choice: Demand and stock are well balanced!"
        elif demand_stock_ratio >= 1.2:
            ai_suggestion = "🔥 Killer Choice! Demand is outpacing stock. Consider increasing inventory."
        else:
            ai_suggestion = "✅ Stock level is within normal range."
    else:
        ai_suggestion = "ℹ️ Not enough data for AI prediction."

    summary = {
        'Product Name': product.name,
        'Retailer': product.retailer.name,
        'Current Stock': product.stock,
        'Total Sold': total_sold,
        'AI Prediction (7d)': analytics.predicted_stock if analytics else '',
        'Overstocked': analytics.overstocked if analytics else '',
        'Understocked': analytics.understocked if analytics else '',
        'AI Notes': analytics.notes if analytics else '',
        'AI Suggestion': ai_suggestion,
    }
    df_summary = pd.DataFrame([summary])

    # Prepare sales trend data
    if not df_orders.empty:
        df_orders['DateOnly'] = pd.to_datetime(df_orders['Date']).dt.date
        sales_trend = df_orders.groupby('DateOnly')['Quantity'].sum().reset_index()
    else:
        sales_trend = pd.DataFrame(columns=['DateOnly', 'Quantity'])

    # Prepare order source data
    if not df_orders.empty:
        source_counts = df_orders['Order Source'].value_counts().reset_index()
        source_counts.columns = ['Order Source', 'Count']
    else:
        source_counts = pd.DataFrame(columns=['Order Source', 'Count'])

    # Description/procedure
    description = [
        ["Saarthi Product Analytics Report"],
        [""],
        ["How were these insights generated?"],
        ["- The AI/ML model uses your product's historical sales data."],
        ["- It applies a linear regression model with rolling averages and weekly seasonality (day-of-week) to predict demand for the next 7 days."],
        ["- The model flags 'Overstocked' if your stock is much higher than predicted demand, and 'Understocked' if it's much lower."],
        ["- All charts and tables are generated from your actual order data."],
        [""],
        ["How to use this report?"],
        ["- Use the 'AI Prediction' to optimize your inventory."],
        ["- Check the 'Order Sources' pie chart to see where most orders come from."],
        ["- Use the 'Sales Trend' chart to spot demand patterns."],
        [""],
        ["For more details, visit your Saarthi dashboard!"]
    ]
    df_description = pd.DataFrame(description)

    # Create an Excel file in memory
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
        df_summary.to_excel(writer, index=False, sheet_name='Summary')
        df_orders.to_excel(writer, index=False, sheet_name='Order History')
        sales_trend.to_excel(writer, index=False, sheet_name='Sales Trend')
        source_counts.to_excel(writer, index=False, sheet_name='Order Sources')
        df_description.to_excel(writer, index=False, header=False, sheet_name='Description')

        workbook = writer.book

        # Pie chart for order sources
        if not source_counts.empty:
            worksheet = writer.sheets['Order Sources']
            chart = workbook.add_chart({'type': 'pie'})
            chart.add_series({
                'name': 'Order Sources',
                'categories': ['Order Sources', 1, 0, len(source_counts), 0],
                'values':     ['Order Sources', 1, 1, len(source_counts), 1],
                'data_labels': {'percentage': True, 'category': True}
            })
            chart.set_title({'name': 'Order Sources Distribution'})
            worksheet.insert_chart('D2', chart)

        # Line chart for sales trend
        if not sales_trend.empty:
            worksheet = writer.sheets['Sales Trend']
            chart = workbook.add_chart({'type': 'line'})
            chart.add_series({
                'name': 'Units Sold',
                'categories': ['Sales Trend', 1, 0, len(sales_trend), 0],
                'values':     ['Sales Trend', 1, 1, len(sales_trend), 1],
                'marker': {'type': 'circle', 'size': 6},
                'line': {'color': '#0d6efd'}
            })
            chart.set_title({'name': 'Sales Trend'})
            chart.set_x_axis({'name': 'Date'})
            chart.set_y_axis({'name': 'Units Sold'})
            worksheet.insert_chart('D2', chart)

    output.seek(0)
    filename = f"{product.name}_analytics_report.xlsx"
    response = HttpResponse(
        output,
        content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
    response['Content-Disposition'] = f'attachment; filename={filename}'
    return response


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
    pred = analytics.predicted_stock if analytics and analytics.predicted_stock is not None else None

    if pred is not None and pred > 0:
        demand_stock_ratio = pred / product.stock if product.stock > 0 else 0

        if product.stock > pred * 10:
            ai_suggestion = "🚩 Drop Product: Stock is much higher than AI-predicted demand. Consider discontinuing or heavy discounting."
        elif demand_stock_ratio < 0.1:
            ai_suggestion = "😕 Poor Choice: Demand is very low compared to stock. Consider alternatives."
        elif demand_stock_ratio < 0.3:
            ai_suggestion = "🟡 Okay Choice: Demand is low, monitor closely or promote."
        elif demand_stock_ratio < 0.7:
            ai_suggestion = "🟢 Good Choice: Demand is decent, but you can optimize stock."
        elif demand_stock_ratio < 1.2:
            ai_suggestion = "💎 Great Choice: Demand and stock are well balanced!"
        elif demand_stock_ratio >= 1.2:
            ai_suggestion = "🔥 Killer Choice! Demand is outpacing stock. Consider increasing inventory."
        else:
            ai_suggestion = "✅ Stock level is within normal range."
    else:
        ai_suggestion = "ℹ️ Not enough data for AI prediction."
    context = {
        'product': product,
        'orders': orders,
        'analytics': analytics,
        'suggestion': suggestion,
        'total_sold': total_sold,
        'ai_suggestion': ai_suggestion,
        'sales_labels': json.dumps(sales_labels),
        'sales_values': json.dumps(sales_values),
        'source_labels': json.dumps(source_labels),
        'source_values': json.dumps(source_values),
    }
    return render(request, 'inventory/product_analytics.html', context)



def update_stock(request, product_id):
    product = get_object_or_404(Product, id=product_id)
    if request.method == 'POST':
        new_stock = int(request.POST['stock'])
        product.stock = new_stock
        product.save()
        messages.success(request, "Stock updated!")
        return redirect(reverse('product_list', args=[product.retailer.id]))
    return render(request, 'inventory/update_stock.html', {'product': product})