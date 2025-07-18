from django.shortcuts import render, get_object_or_404, redirect
from django.urls import reverse
from django.utils import timezone
from .models import Retailer, Product, Order, ProductAnalytics
from django.db.models import Sum, F
from django.contrib import messages
import pandas as pd
import numpy as np
from .models import SmartDropPoint
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


from django.shortcuts import render, get_object_or_404, redirect
from django.urls import reverse
from django.http import JsonResponse, HttpResponse
from django.contrib import messages
from .models import Store, Drone, Delivery
import random

def get_best_route(lat1, lng1, lat2, lng2):
    """
    Simulate an AI-based best route between two points.
    For demo: returns a list of waypoints (lat, lng) including start, 1-2 random midpoints, and end.
    """
    # Add 1-2 random waypoints between start and end to simulate "AI routing"
    waypoints = [[lat1, lng1]]
    for _ in range(random.randint(1, 2)):
        frac = random.uniform(0.3, 0.7)
        mid_lat = lat1 + frac * (lat2 - lat1) + random.uniform(-0.05, 0.05)
        mid_lng = lng1 + frac * (lng2 - lng1) + random.uniform(-0.05, 0.05)
        waypoints.append([mid_lat, mid_lng])
    waypoints.append([lat2, lng2])
    return waypoints

def check_traffic_and_reroute(delivery):
    """
    Simulate AI-based re-routing due to traffic.
    For demo: slightly alter the route by adding a new random waypoint.
    """
    route = delivery.route or []
    if len(route) >= 2:
        # Insert a random detour between first and last
        lat1, lng1 = route[0]
        lat2, lng2 = route[-1]
        detour_lat = (lat1 + lat2) / 2 + random.uniform(-0.1, 0.1)
        detour_lng = (lng1 + lng2) / 2 + random.uniform(-0.1, 0.1)
        new_route = [route[0], [detour_lat, detour_lng], route[-1]]
        return new_route
    return route
# 1. Store Management
def store_list(request):
    stores = Store.objects.all()
    return render(request, 'drone/store_list.html', {'stores': stores})

def add_store(request):
    if request.method == 'POST':
        name = request.POST['name']
        address = request.POST.get('address', '')
        latitude = float(request.POST['latitude'])
        longitude = float(request.POST['longitude'])
        Store.objects.create(name=name, address=address, latitude=latitude, longitude=longitude)
        messages.success(request, "Store added!")
        return redirect('store_list')
    return render(request, 'drone/add_store.html')

# 2. Drone Management
def drone_list(request):
    drones = Drone.objects.all()
    return render(request, 'drone/drone_list.html', {'drones': drones})

def add_drone(request):
    if request.method == 'POST':
        name = request.POST['name']
        max_weight_kg = float(request.POST['max_weight_kg'])
        battery_capacity_mah = int(request.POST['battery_capacity_mah'])
        current_battery_mah = int(request.POST['current_battery_mah'])
        speed_kmph = float(request.POST['speed_kmph'])
        max_flight_time_min = int(request.POST['max_flight_time_min'])
        Drone.objects.create(
            name=name,
            max_weight_kg=max_weight_kg,
            battery_capacity_mah=battery_capacity_mah,
            current_battery_mah=current_battery_mah,
            speed_kmph=speed_kmph,
            max_flight_time_min=max_flight_time_min
        )
        messages.success(request, "Drone added!")
        return redirect('drone_list')
    return render(request, 'drone/add_drone.html')

# 3. Delivery Creation & Assignment
def create_delivery(request):
    stores = Store.objects.all()
    drones = Drone.objects.filter(status='idle')
    persons = DeliveryPerson.objects.filter(status='active')
    if request.method == 'POST':
        source_store = get_object_or_404(Store, id=request.POST['source_store'])
        destination_lat = float(request.POST['destination_lat'])
        destination_lng = float(request.POST['destination_lng'])
        package_weight_kg = float(request.POST['package_weight_kg'])

        # Try to assign a drone first
        drone = drones.filter(max_weight_kg__gte=package_weight_kg).first()
        if drone:
            route = get_best_route(source_store.latitude, source_store.longitude, destination_lat, destination_lng)
            delivery = Delivery.objects.create(
                drone=drone,
                source_store=source_store,
                destination_lat=destination_lat,
                destination_lng=destination_lng,
                package_weight_kg=package_weight_kg,
                status='assigned',
                route=route,
                suggested_mode='drone'
            )
            drone.status = 'assigned'
            drone.save()
            messages.success(request, f"Delivery #{delivery.id} created and drone assigned!")
            return redirect('delivery_list')
        else:
            # Assign to a delivery person if no drone is available
            person = persons.first()
            if person:
                # Use Google Maps route for the person
                route_info = get_route_info(
                    (source_store.latitude, source_store.longitude),
                    (destination_lat, destination_lng),
                    mode='bicycling'
                )
                if route_info and 'polyline' in route_info:
                    import polyline
                    route = polyline.decode(route_info['polyline'])
                else:
                    route = [[source_store.latitude, source_store.longitude], [destination_lat, destination_lng]]
                delivery = Delivery.objects.create(
                    assigned_to=person,
                    source_store=source_store,
                    destination_lat=destination_lat,
                    destination_lng=destination_lng,
                    package_weight_kg=package_weight_kg,
                    status='assigned',
                    route=route,
                    suggested_mode='biker'
                )
                messages.success(request, f"Delivery #{delivery.id} created and assigned to {person.name}!")
                return redirect('delivery_list')
            else:
                messages.error(request, "No available drone or delivery person for this delivery!")
                return render(request, 'drone/create_delivery.html', {'stores': stores, 'drones': drones, 'persons': persons})
    return render(request, 'drone/create_delivery.html', {'stores': stores, 'drones': drones, 'persons': persons})

# 4. Deploy Drone (after checks)
def deploy_drone(request, delivery_id):
    delivery = get_object_or_404(Delivery, id=delivery_id)
    drone = delivery.drone
    if not drone:
        messages.error(request, "No drone assigned!")
        return redirect('delivery_detail', delivery_id=delivery.id)
    if delivery.package_weight_kg > drone.max_weight_kg:
        messages.error(request, "Package too heavy for this drone!")
        return redirect('delivery_detail', delivery_id=delivery.id)
    if drone.current_battery_mah < 0.1 * drone.battery_capacity_mah:
        messages.error(request, "Drone battery too low!")
        return redirect('delivery_detail', delivery_id=delivery.id)
    delivery.status = 'in_progress'
    delivery.started_at = timezone.now()
    delivery.save()
    drone.status = 'in_flight'
    drone.save()
    messages.success(request, "Drone deployed!")
    return redirect('delivery_detail', delivery_id=delivery.id)

# 5. Delivery List Page
def delivery_list(request):
    deliveries = Delivery.objects.all().order_by('-id')
    drones = Drone.objects.filter(status='idle')
    persons = DeliveryPerson.objects.filter(status='active')
    return render(request, 'drone/delivery_list.html', {
        'deliveries': deliveries,
        'drones': drones,
        'persons': persons,
    })
import heapq
def deploy_person(request, delivery_id):
    delivery = get_object_or_404(Delivery, id=delivery_id)
    person = delivery.assigned_to
    if not person:
        messages.error(request, "No delivery person assigned!")
        return redirect('delivery_detail', delivery_id=delivery.id)
    if delivery.status != 'assigned':
        messages.error(request, "Delivery is not in assigned state!")
        return redirect('delivery_detail', delivery_id=delivery.id)
    delivery.status = 'in_progress'
    delivery.started_at = timezone.now()
    delivery.save()
    person.status = 'active'  # Optionally set to 'on_delivery' if you have such a status
    person.save()
    messages.success(request, f"Delivery started for {person.name}!")
    return redirect('delivery_detail', delivery_id=delivery.id)
def find_smartdrop_route(source, destination, smartdrops, max_range_km):
    """
    Returns a list of waypoints: [source, smartdrop1, ..., destination]
    Each hop is within max_range_km.
    """
    # Build all points list
    points = [(source[0], source[1], 'source')] + \
             [(sdp.latitude, sdp.longitude, sdp.name) for sdp in smartdrops] + \
             [(destination[0], destination[1], 'destination')]
    n = len(points)
    # Build adjacency list for hops within range
    adj = {i: [] for i in range(n)}
    for i in range(n):
        for j in range(n):
            if i == j:
                continue
            dist = math.hypot(points[i][0] - points[j][0], points[i][1] - points[j][1])
            if dist <= max_range_km:
                adj[i].append(j)
    # Dijkstra
    heap = [(0, 0, [0])]  # (cost, idx, path)
    visited = set()
    while heap:
        cost, idx, path = heapq.heappop(heap)
        if idx == n - 1:
            # Found path to destination
            return [ (points[i][0], points[i][1]) for i in path ]
        if idx in visited:
            continue
        visited.add(idx)
        for nei in adj[idx]:
            if nei not in path:
                heapq.heappush(heap, (cost + 1, nei, path + [nei]))
    return None  # No route found
# 6. Live Tracking Page
def live_tracking(request):
    drones = Drone.objects.filter(status='in_flight')
    # Show all deliveries that are assigned or in progress
    deliveries = Delivery.objects.filter(status__in=['assigned', 'in_progress'])
    stores = Store.objects.all()
    smartdrops = SmartDropPoint.objects.all()  # <-- Add this line
    persons = DeliveryPerson.objects.filter(status='active')  # Add this line

    return render(request, 'drone/live_tracking.html', {
        'drones': drones,
        'deliveries': deliveries,
        'stores': stores,
        'smartdrops': smartdrops, 
        'persons': persons,  # Pass to template

           }) 


import random
import math
def will_collide(drone1, route1, drone2, route2, step=0.05, threshold=0.02):
    """
    Simulate both drones moving along their routes step by step.
    If at any step, their positions are closer than 'threshold', return True.
    """
    if not route1 or not route2:
        return False
    # Simulate up to the length of the longer route
    max_steps = max(len(route1), len(route2))
    for i in range(max_steps):
        idx1 = min(i, len(route1)-1)
        idx2 = min(i, len(route2)-1)
        lat1, lng1 = route1[idx1]
        lat2, lng2 = route2[idx2]
        dist = math.hypot(lat1 - lat2, lng1 - lng2)
        if dist < threshold:
            return True
    return False

def move_towards(lat1, lng1, lat2, lng2, step=0.01):
    # Move from (lat1, lng1) towards (lat2, lng2) by 'step' fraction
    if lat1 == lat2 and lng1 == lng2:
        return lat1, lng1
    dx = lat2 - lat1
    dy = lng2 - lng1
    dist = math.hypot(dx, dy)
    if dist < step:
        return lat2, lng2
    ratio = step / dist
    return lat1 + dx * ratio, lng1 + dy * ratio

import math    
import math
from django.http import JsonResponse


import math
import random
from django.http import JsonResponse

def get_nearest_point(lat, lng, points):
    min_dist = float('inf')
    nearest = None
    for p in points:
        dist = math.hypot(lat - p.latitude, lng - p.longitude)
        if dist < min_dist:
            min_dist = dist
            nearest = p
    return nearest

def drone_positions_api(request):
    from .models import SmartDropPoint, Store
    drones = list(Drone.objects.filter(status='in_flight'))
    smartdrops = list(SmartDropPoint.objects.all())
    stores = list(Store.objects.all())
    data = []
    alerts = []

    for d in drones:
        delivery = d.deliveries.filter(status='in_progress').first()
        if delivery:

            if d.current_lat is None or d.current_lng is None:
                d.current_lat = delivery.source_store.latitude
                d.current_lng = delivery.source_store.longitude
                d.save(update_fields=['current_lat', 'current_lng'])

            # Calculate max range in degrees (approx, for demo)
            max_range_km = (d.speed_kmph * d.max_flight_time_min) / 60  # km
            max_range_deg = max_range_km / 111.0  # 1 deg ~ 111km

            # If route is not set or too short, recalculate using Dijkstra
            if not delivery.route or len(delivery.route) < 2:
                route = find_smartdrop_route(
                    (delivery.source_store.latitude, delivery.source_store.longitude),
                    (delivery.destination_lat, delivery.destination_lng),
                    smartdrops,
                    max_range_deg
                )
                if route:
                    delivery.route = route
                    delivery.save()
                else:
                    alerts.append({
                        'drones': [d.id],
                        'message': "❌ No valid route to destination with current SmartDropPoints!"
                    })
                    continue

            # Move towards next waypoint in route
            route = delivery.route
            if len(route) > 1:
                target_lat, target_lng = route[1]
            else:
                target_lat, target_lng = route[0]

            # --- Fetch weather for the drone's next position ---
            weather = get_weather(d.current_lat, d.current_lng)
            wind_speed = weather['wind_speed']
            condition = weather['condition']

            # Adjust drone speed for wind (simple: headwind reduces speed)
            effective_speed = max(1, d.speed_kmph - wind_speed)  # never less than 1 km/h

            # If wind_speed > 25 km/h or condition is 'Thunderstorm', trigger alert/crash
            if wind_speed > 55 or condition in ['Thunderstorm', 'Extreme']:
                alerts.append({
                    'drones': [d.id],
                    'message': f"🌪️ Severe weather! Wind: {wind_speed:.1f} km/h, Condition: {condition}. Drone #{d.id} crashed!"
                })
                d.status = 'crashed'
                d.save(update_fields=['status'])
                continue
            elif wind_speed > 25 or condition in ['Rain', 'Snow']:
                alerts.append({
                    'drones': [d.id],
                    'message': f"⚠️ Bad weather for Drone #{d.id}: Wind {wind_speed:.1f} km/h, Condition: {condition}."
                })

            # Calculate distance to move (simulate speed per API call)
            step_distance = (effective_speed / 111) / 60  # degrees per API call (1 min step, 1 deg ~ 111km)
            distance_to_target = math.hypot(target_lat - d.current_lat, target_lng - d.current_lng)
            move_ratio = min(1, step_distance / distance_to_target) if distance_to_target > 0 else 1
            next_lat = d.current_lat + (target_lat - d.current_lat) * move_ratio
            next_lng = d.current_lng + (target_lng - d.current_lng) * move_ratio
            actual_distance = math.hypot(next_lat - d.current_lat, next_lng - d.current_lng)

            # --- Battery calculation based on distance ---
            total_possible_distance = max_range_deg  # in degrees
            battery_used = (actual_distance / total_possible_distance) * d.battery_capacity_mah
            d.current_battery_mah = max(0, d.current_battery_mah - battery_used)
            battery_percent = (d.current_battery_mah / d.battery_capacity_mah) * 100 if d.battery_capacity_mah else 0

            # If battery drops to zero, mark as crashed
            if d.current_battery_mah <= 0:
                d.status = 'crashed'
                d.save(update_fields=['status'])
                alerts.append({
                    'drones': [d.id],
                    'message': f"💥 Drone #{d.id} has crashed due to battery depletion!"
                })
                continue

            # --- Reroute to nearest SmartDropPoint if battery < 20% and not already going there ---
            if battery_percent < 20:
                nearest_sdp = get_nearest_point(d.current_lat, d.current_lng, smartdrops)
                if nearest_sdp:
                    # Only reroute if not already heading to this SmartDropPoint
                    if not (abs(target_lat - nearest_sdp.latitude) < 1e-4 and abs(target_lng - nearest_sdp.longitude) < 1e-4):
                        alerts.append({
                            'drones': [d.id],
                            'message': f"🔋 Drone #{d.id} battery low ({int(battery_percent)}%). Rerouting to nearest SmartDrop Point: {nearest_sdp.name}!"
                        })
                        # Set new route: current -> smartdrop -> destination
                        delivery.route = [
                            [d.current_lat, d.current_lng],
                            [nearest_sdp.latitude, nearest_sdp.longitude],
                            [delivery.destination_lat, delivery.destination_lng]
                        ]
                        delivery.save()
                        # Update target to SmartDropPoint for this step
                        target_lat, target_lng = nearest_sdp.latitude, nearest_sdp.longitude
                        # Recalculate movement for this step
                        distance_to_target = math.hypot(target_lat - d.current_lat, target_lng - d.current_lng)
                        move_ratio = min(1, step_distance / distance_to_target) if distance_to_target > 0 else 1
                        next_lat = d.current_lat + (target_lat - d.current_lat) * move_ratio
                        next_lng = d.current_lng + (target_lng - d.current_lng) * move_ratio

            # Move drone
            d.current_lat = next_lat
            d.current_lng = next_lng
            d.altitude_m = random.randint(50, 120)
            d.save(update_fields=['current_lat', 'current_lng', 'current_battery_mah', 'altitude_m'])

            # Check if drone has reached the current waypoint
            dist_to_next = math.hypot(target_lat - next_lat, target_lng - next_lng)
            if dist_to_next < 0.01 and len(route) > 1:
                # If at SmartDropPoint or Store, "charge" battery and remove from route
                at_smartdrop = any(abs(target_lat - sdp.latitude) < 1e-4 and abs(target_lng - sdp.longitude) < 1e-4 for sdp in smartdrops)
                at_store = any(abs(target_lat - s.latitude) < 1e-4 and abs(target_lng - s.longitude) < 1e-4 for s in stores)
                if at_smartdrop or at_store:
                    d.current_battery_mah = d.battery_capacity_mah
                    d.save(update_fields=['current_battery_mah'])
                    alerts.append({
                        'drones': [d.id],
                        'message': f"✅ Drone #{d.id} charged at {'SmartDrop Point' if at_smartdrop else 'Store'}!"
                    })
                # Remove reached waypoint from route
                delivery.route = [route[0]] + route[2:]
                delivery.save()

            # Check if drone has reached final destination
            final_lat, final_lng = route[-1]
            dist_to_dest = math.hypot(final_lat - next_lat, final_lng - next_lng)
            if dist_to_dest < 0.01:
                d.status = 'idle'
                d.save(update_fields=['status'])
                delivery.status = 'delivered'
                delivery.save(update_fields=['status'])
                # After delivery, go to nearest SmartDrop or Store
                nearest_sdp = get_nearest_point(next_lat, next_lng, smartdrops)
                nearest_store = get_nearest_point(next_lat, next_lng, stores)
                if nearest_sdp and nearest_store:
                    dist_sdp = math.hypot(next_lat - nearest_sdp.latitude, next_lng - nearest_sdp.longitude)
                    dist_store = math.hypot(next_lat - nearest_store.latitude, next_lng - nearest_store.longitude)
                    # Only create recharge delivery if NOT already at the point
                    if dist_sdp > 0.01 and dist_sdp < dist_store:
                        d.current_lat = next_lat
                        d.current_lng = next_lng
                        d.status = 'in_flight'
                        d.save(update_fields=['current_lat', 'current_lng', 'status'])
                        d_route = [[next_lat, next_lng], [nearest_sdp.latitude, nearest_sdp.longitude]]
                        d.deliveries.create(
                            source_store=delivery.source_store,
                            destination_lat=d_route[1][0],
                            destination_lng=d_route[1][1],
                            package_weight_kg=0,
                            status='in_progress',
                            route=d_route
                        )
                    elif dist_store > 0.01 and dist_store <= dist_sdp:
                        d.current_lat = next_lat
                        d.current_lng = next_lng
                        d.status = 'in_flight'
                        d.save(update_fields=['current_lat', 'current_lng', 'status'])
                        d_route = [[next_lat, next_lng], [nearest_store.latitude, nearest_store.longitude]]
                        d.deliveries.create(
                            source_store=delivery.source_store,
                            destination_lat=d_route[1][0],
                            destination_lng=d_route[1][1],
                            package_weight_kg=0,
                            status='in_progress',
                            route=d_route
                        )
                    else:
                        # Already at a SmartDrop/Store, just idle here!
                        d.status = 'idle'
                        d.save(update_fields=['status'])

        data.append({
            'id': d.id,
            'lat': d.current_lat,
            'lng': d.current_lng,
            'battery': d.current_battery_mah,
            'altitude': getattr(d, 'altitude_m', 0),
            'speed': d.speed_kmph,
            'max_flight_time': d.max_flight_time_min,
            'status': d.get_status_display(),
            'route': delivery.route if delivery and delivery.route else [],
            'weather': weather,
        })
    return JsonResponse({'drones': data, 'alerts': alerts})





# 8. AI-based Re-routing (triggered by traffic or manual)
def reroute_drone(request, delivery_id):
    delivery = get_object_or_404(Delivery, id=delivery_id)
    new_route = check_traffic_and_reroute(delivery)
    delivery.route = new_route
    delivery.save()
    return JsonResponse({'new_route': new_route})

# 9. Delivery Details Page
def delivery_detail(request, delivery_id):
    delivery = get_object_or_404(Delivery, id=delivery_id)
    return render(request, 'drone/delivery_detail.html', {'delivery': delivery})

# 10. Drone Details Page (optional)
def drone_detail(request, drone_id):
    drone = get_object_or_404(Drone, id=drone_id)
    return render(request, 'drone/drone_detail.html', {'drone': drone})


from .models import SmartDropPoint

def smartdrop_list(request):
    points = SmartDropPoint.objects.all()
    return render(request, 'drone/smartdrop_list.html', {'points': points})

def add_smartdrop(request):
    retailers = Retailer.objects.all()
    if request.method == 'POST':
        name = request.POST['name']
        latitude = float(request.POST['latitude'])
        longitude = float(request.POST['longitude'])
        retailer_id = int(request.POST['retailer'])
        retailer = Retailer.objects.get(id=retailer_id)
        SmartDropPoint.objects.create(name=name, latitude=latitude, longitude=longitude, added_by=retailer)
        messages.success(request, "SmartDrop Point added!")
        return redirect('smartdrop_list')
    return render(request, 'drone/add_smartdrop.html', {'retailers': retailers})



import requests

OPENWEATHER_API_KEY = "98f719b0134ab093e0433373c6019e8a"

def get_weather(lat, lng):
    url = (
        f"https://api.openweathermap.org/data/2.5/weather?"
        f"lat={lat}&lon={lng}&appid={OPENWEATHER_API_KEY}&units=metric"
    )
    try:
        resp = requests.get(url, timeout=3)
        if resp.status_code == 200:
            data = resp.json()
            wind_speed = data.get('wind', {}).get('speed', 0)  # m/s
            wind_deg = data.get('wind', {}).get('deg', 0)
            weather_main = data.get('weather', [{}])[0].get('main', '')
            return {
                'wind_speed': wind_speed * 3.6,  # convert m/s to km/h
                'wind_deg': wind_deg,
                'condition': weather_main
            }
    except Exception as e:
        print("Weather API error:", e)
    # fallback if API fails
    return {'wind_speed': 0, 'wind_deg': 0, 'condition': 'Clear'}
def move_bikers(alerts=None):
    deliveries = Delivery.objects.filter(status='in_progress', assigned_to__isnull=False)
    for delivery in deliveries:
        person = delivery.assigned_to
        route = delivery.route
        if not route or len(route) < 2:
            delivery.route = get_best_route(
                delivery.source_store.latitude, delivery.source_store.longitude,
                delivery.destination_lat, delivery.destination_lng
            )
            delivery.save()
            route = delivery.route
        risk_index = predict_accident_risk(person)
        if risk_index == "High" and alerts is not None:
            alerts.append({'type': 'risk', 'message': f"⚠️ Rash driving detected for {person.name}! May cause potential crash."})
        # --- Manual accident simulation ---
        if getattr(person, 'mimic_accident', False):
            if not hasattr(person, '_accident_start') or person._accident_start is None:
                person.accel = -10
                person.velocity = 1
                person._accident_start = timezone.now()
                if not person.accident_flag:
                    person.accident_flag = True
                    person.accident_time = person._accident_start
                person.save(update_fields=['accel', 'velocity', 'mimic_accident', 'accident_flag', 'accident_time'])
            elif (timezone.now() - person._accident_start).total_seconds() < 60:
                person.accel = 0
                person.velocity = 0
                person.save(update_fields=['accel', 'velocity'])
            else:
                person.mimic_accident = False
                person._accident_start = None
                person.accel = 0
                person.velocity = 0
                person.save(update_fields=['accel', 'velocity', 'mimic_accident'])
            # Always check accident detection logic
            person.current_delivery = delivery
            if detect_accident(person):
                delivery.status = 'failed'
                delivery.save(update_fields=['status'])
                if alerts is not None:
                    alerts.append({'type': 'accident', 'message': f"🚨 Suspected accident for {person.name}! Delivery #{delivery.id} will be reassigned."})
                reroute_delivery_on_accident(delivery)
            continue

        # --- Normal simulation ---
        import random
        person.velocity = round(random.uniform(5, 12), 2)
        person.accel = round(random.uniform(-2, 2), 2)

        # --- Rash driving alert ---
        risk_index = predict_accident_risk(person)
        if risk_index == "High" and alerts is not None:
            alerts.append({'type': 'risk', 'message': f"⚠️ Rash driving detected for {person.name}! May cause potential crash."})

        # --- Accident detection ---
        person.current_delivery = delivery
        if detect_accident(person):
            delivery.status = 'failed'
            delivery.save(update_fields=['status'])
            if alerts is not None:
                alerts.append({'type': 'accident', 'message': f"🚨 Suspected accident for {person.name}! Delivery #{delivery.id} will be reassigned."})
            reroute_delivery_on_accident(delivery)
            continue

        # --- Waypoint movement code (unchanged) ---
        if person.current_lat is None or person.current_lng is None:
            person.current_lat, person.current_lng = route[0]
            person.save(update_fields=['current_lat', 'current_lng'])
        step = 40 / 111 / 60
        for i in range(len(route)-1):
            lat1, lng1 = route[i]
            lat2, lng2 = route[i+1]
            if abs(person.current_lat - lat2) > 1e-4 or abs(person.current_lng - lng2) > 1e-4:
                break
        else:
            delivery.status = 'delivered'
            delivery.save(update_fields=['status'])
            person.status = 'active'
            person.save(update_fields=['status'])
            continue
        dx = lat2 - person.current_lat
        dy = lng2 - person.current_lng
        dist = (dx**2 + dy**2) ** 0.5
        if dist < step:
            person.current_lat, person.current_lng = lat2, lng2
        else:
            ratio = step / dist
            person.current_lat += dx * ratio
            person.current_lng += dy * ratio
        person.save(update_fields=['current_lat', 'current_lng', 'velocity', 'accel'])

def detect_accident(person):
    now = timezone.now()
    # 1. Detect hard deceleration and low velocity: start suspect timer
    if person.accel < -8 and person.velocity < 2 and not person.accident_flag:
        person.accident_flag = True
        person.accident_time = now
        person.save(update_fields=['accident_flag', 'accident_time'])
        return False  # Not yet confirmed

    # 2. If already flagged, check if velocity remains low for 1 min (or 10s for demo)
    if person.accident_flag:
        if person.velocity < 2 and person.accident_time and (now - person.accident_time).total_seconds() > 60:
            # Confirmed accident
            AccidentEvent.objects.create(
                delivery=getattr(person, 'current_delivery', None),
                person=person,
                timestamp=now,
                details="Detected hard deceleration and 1 min zero velocity"
            )
            person.status = 'accident'
            person.accident_flag = False
            person.accident_time = None
            person.save(update_fields=['status', 'accident_flag', 'accident_time'])
            return True
        # If moving again, reset
        elif person.velocity > 2:
            person.accident_flag = False
            person.accident_time = None
            person.save(update_fields=['accident_flag', 'accident_time'])
    return False


import requests
from django.http import JsonResponse
from django.utils import timezone
from .models import Delivery, DeliveryPerson, Drone, AccidentEvent
def delivery_person_positions_api(request):
    alerts = []
    move_bikers(alerts)
    # Get all persons who have an in-progress delivery or are in accident state
    in_progress_deliveries = Delivery.objects.filter(status='in_progress', assigned_to__isnull=False)
    accident_persons = DeliveryPerson.objects.filter(status='accident')
    person_ids = list(in_progress_deliveries.values_list('assigned_to', flat=True)) + list(accident_persons.values_list('id', flat=True))
    persons = DeliveryPerson.objects.filter(id__in=person_ids).distinct()
    data = []
    for p in persons:
        delivery = Delivery.objects.filter(assigned_to=p, status='in_progress').first()
        route = delivery.route if delivery and delivery.route else []
        risk_index = predict_accident_risk(p)
        data.append({
            'id': p.id,
            'name': p.name,
            'lat': p.current_lat,
            'lng': p.current_lng,
            'velocity': p.velocity,
            'accel': p.accel,
            'status': p.status,
            'route': route,
            'risk_index': risk_index,
        })
    return JsonResponse({'persons': data, 'alerts': alerts})
def detect_accident(person):
    now = timezone.now()
    # 1. Detect hard deceleration and low velocity: start suspect timer
    if person.accel < -8 and person.velocity < 2:
        if not person.accident_flag:
            person.accident_flag = True
            person.accident_time = now
            person.save(update_fields=['accident_flag', 'accident_time'])
        # Do NOT return here, let the next block check for confirmation

    # 2. If already flagged, check if velocity remains low for 1 min (or 10s for demo)
    if person.accident_flag:
        if person.velocity < 2 and person.accident_time and (now - person.accident_time).total_seconds() > 5:
            # Confirmed accident
            print("Confirmed accident for person:", person.id)
            AccidentEvent.objects.create(
                delivery=getattr(person, 'current_delivery', None),
                person=person,
                timestamp=now,
                details="Detected hard deceleration and 1 min zero velocity"
            )

            print("heeeee")
            person.status = 'accident'
            person.accident_flag = False
            person.accident_time = None
            person.save(update_fields=['status', 'accident_flag', 'accident_time'])
            return True
        # If moving again, reset
        elif person.velocity > 2:
            person.accident_flag = False
            person.accident_time = None
            person.save(update_fields=['accident_flag', 'accident_time'])
    return False

from django.views.decorators.csrf import csrf_exempt

@csrf_exempt  # Only if you have issues with CSRF in AJAX, otherwise remove this
def assign_delivery(request, delivery_id):
    delivery = get_object_or_404(Delivery, id=delivery_id)
    if request.method == 'POST':
        assigned_to = request.POST.get('assigned_to')
        if assigned_to:
            if assigned_to.startswith('drone-'):
                drone_id = int(assigned_to.split('-')[1])
                drone = Drone.objects.get(id=drone_id)
                delivery.drone = drone
                delivery.assigned_to = None
                delivery.suggested_mode = 'drone'
                drone.status = 'assigned'
                drone.save()
            elif assigned_to.startswith('person-'):
                person_id = int(assigned_to.split('-')[1])
                person = DeliveryPerson.objects.get(id=person_id)
                delivery.assigned_to = person
                delivery.drone = None
                delivery.suggested_mode = 'biker'
            delivery.save()
            messages.success(request, "Delivery assignment updated!")
        else:
            messages.error(request, "No resource selected for assignment.")
    return redirect('delivery_list')
global count
count=0
# 4. Get best route (Google Maps or OSRM API)
def get_route_info(origin, dest, mode='bicycling'):
    global count
    print(count)
    if(count<1000):
        if mode == 'drone':
            # Straight line for drone
            import math
            lat1, lng1 = origin
            lat2, lng2 = dest
            distance = math.hypot(lat2 - lat1, lng2 - lng1) * 111000  # rough meters
            duration = distance / 35000  # 35km/h drone
            return {'distance': distance, 'duration': duration}
        else:
            # Google Maps Directions API (replace with your API key)
            api_key = 'AIzaSyBm9rEixEaoOLdq2yUEVkxKLeJ6zYPH0p4'
            url = (
                f"https://maps.googleapis.com/maps/api/directions/json?"
                f"origin={origin[0]},{origin[1]}&destination={dest[0]},{dest[1]}"
                f"&mode={mode}&key={api_key}"
            )
            resp = requests.get(url)
            count+=1
            if resp.status_code == 200:
                data = resp.json()
                if data['routes']:
                    leg = data['routes'][0]['legs'][0]
                    return {
                        'distance': leg['distance']['value'],
                        'duration': leg['duration']['value'],
                        'polyline': data['routes'][0]['overview_polyline']['points']
                    }
        return None

# 5. Reroute delivery to another person if accident detected
def reroute_delivery_on_accident(delivery):
    # Find another available person
    new_person = DeliveryPerson.objects.filter(status='active').exclude(id=delivery.assigned_to.id).first()
    if new_person:
        delivery.assigned_to = new_person
        delivery.status = 'in_progress'  # <-- Ensure status is correct for new person
        delivery.save()
        # Optionally notify new_person
        return True
    return False

# 6. (Optional) Analytics: Predict accident risk (out-of-box idea)
def predict_accident_risk(person):
    # Example: Use last N accelerometer/velocity readings
    # (You can expand this with ML or heuristics)
    if abs(person.accel) > 7 or person.velocity > 45:
        return "High"
    elif abs(person.accel) > 4:
        return "Medium"
    else:
        return "Low"
    
def accident_alerts(request):
    accidents = AccidentEvent.objects.select_related('person', 'delivery').order_by('-timestamp')
    return render(request, 'drone/accident_alerts.html', {'accidents': accidents})


from .models import DeliveryPerson

def person_list(request):
    persons = DeliveryPerson.objects.all()
    return render(request, 'drone/person_list.html', {'persons': persons})

def add_person(request):
    if request.method == 'POST':
        name = request.POST['name']
        DeliveryPerson.objects.create(name=name)
        messages.success(request, "Delivery person added!")
        return redirect('person_list')
    return render(request, 'drone/add_person.html')

def person_detail(request, person_id):
    person = get_object_or_404(DeliveryPerson, id=person_id)
    return render(request, 'drone/person_detail.html', {'person': person})


from django.views.decorators.csrf import csrf_exempt
from django.http import JsonResponse
import random
@csrf_exempt
def mimic_accident_api(request):
    from .models import DeliveryPerson, Delivery
    persons = list(DeliveryPerson.objects.filter(status='active'))
    random.shuffle(persons)
    for p in persons:
        delivery = Delivery.objects.filter(assigned_to=p, status='in_progress').first()
        if delivery:
            p.mimic_accident = True
            p.save(update_fields=['mimic_accident'])
            return JsonResponse({
                'alerts': [],
                'message': f"Accident condition triggered for {p.name}!"
            })
    return JsonResponse({'alerts': [], 'message': "No active biker with in-progress delivery found."})



def truck3d_view(request):
    return render(request, 'drone/truck3d.html')


from django.views.decorators.csrf import csrf_exempt
from django.http import JsonResponse
from .models import Truck, Parcel
from django.utils import timezone
import base64

@csrf_exempt
def get_truck_parcels(request, truck_id):
    truck = Truck.objects.get(id=truck_id)
    parcels = list(truck.parcels.values())
    return JsonResponse({'truck': truck.name, 'parcels': parcels})

@csrf_exempt
def scan_parcel(request, truck_id, parcel_id):
    if request.method == 'POST':
        parcel = Parcel.objects.get(id=parcel_id, truck_id=truck_id)
        data = request.POST
        parcel.code = data.get('code', '')
        parcel.verified = True
        parcel.tampered = data.get('tampered', 'false') == 'true'
        parcel.scan_time = timezone.now()
        parcel.info = data.get('info', parcel.info)
        # Handle photo (base64 string)
        photo_data = data.get('photo')
        if photo_data:
            import uuid
            from django.core.files.base import ContentFile
            format, imgstr = photo_data.split(';base64,')
            ext = format.split('/')[-1]
            file_name = f"{uuid.uuid4()}.{ext}"
            parcel.photo.save(file_name, ContentFile(base64.b64decode(imgstr)), save=True)
        parcel.save()
        return JsonResponse({'status': 'ok'})
    return JsonResponse({'error': 'POST required'}, status=400)

def truck_security(request, truck_id):
    truck = get_object_or_404(Truck, id=truck_id)
    return render(request, 'drone/security.html', {'truck': truck})


from django.views.decorators.csrf import csrf_exempt
from django.shortcuts import render, redirect
from .models import Truck
from django.contrib import messages

def truck_list(request):
    if request.method == 'POST':
        name = request.POST.get('name')
        session_id = request.POST.get('session_id')
        photo = request.FILES.get('photo')
        truck = Truck.objects.create(name=name, session_id=session_id)
        if photo:
            truck.photo = photo  # Add a photo field to Truck model if not present
            truck.save()
        messages.success(request, "Truck onboarded!")
        return redirect('truck_list')
    trucks = Truck.objects.all()
    return render(request, 'drone/truck_list.html', {'trucks': trucks})