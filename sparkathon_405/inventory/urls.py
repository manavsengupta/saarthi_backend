from django.urls import path
from . import views

urlpatterns = [
    # Truck & Parcel Security/Visualization
    path('trucks/<int:truck_id>/parcels/', views.get_truck_parcels, name='get_truck_parcels'),
    path('trucks/<int:truck_id>/parcels/<int:parcel_id>/scan/', views.scan_parcel, name='scan_parcel'),
    path('truck3d/', views.truck3d_view, name='truck3d'),
    # path('truck_list/', views.truck_list, name='truck_list'),  # Add this view for truck management

    # Store Management
    path('stores/', views.store_list, name='store_list'),
    path('stores/add/', views.add_store, name='add_store'),

    # Drone Management
    path('drones/', views.drone_list, name='drone_list'),
    path('drones/add/', views.add_drone, name='add_drone'),
    path('drones/<int:drone_id>/', views.drone_detail, name='drone_detail'),

    # Delivery Management
    path('deliveries/', views.delivery_list, name='delivery_list'),
    path('deliveries/add/', views.create_delivery, name='create_delivery'),
    path('deliveries/<int:delivery_id>/', views.delivery_detail, name='delivery_detail'),
    path('deliveries/<int:delivery_id>/assign/', views.assign_delivery, name='assign_delivery'),
    path('deliveries/<int:delivery_id>/deploy/', views.deploy_drone, name='deploy_drone'),
    path('deliveries/<int:delivery_id>/reroute/', views.reroute_drone, name='reroute_drone'),
    path('deliveries/<int:delivery_id>/deploy_person/', views.deploy_person, name='deploy_person'),

    # Accident & Tracking
    path('accidents/', views.accident_alerts, name='accident_alerts'),
    path('live_tracking/', views.live_tracking, name='live_tracking'),
    path('api/drone_positions/', views.drone_positions_api, name='drone_positions_api'),
    path('api/delivery_person_positions/', views.delivery_person_positions_api, name='delivery_person_positions_api'),
    path('mimic_accident/', views.mimic_accident_api, name='mimic_accident_api'),

    # Retailer/Product Management
    path('', views.retailer_list, name='retailer_list'),
    path('retailer/<int:retailer_id>/products/', views.product_list, name='product_list'),
    path('retailer/<int:retailer_id>/add_product/', views.add_product, name='add_product'),
    path('product/<int:product_id>/simulate_order/', views.simulate_order, name='simulate_order'),
    path('product/<int:product_id>/analytics/', views.product_analytics, name='product_analytics'),
    path('product/<int:product_id>/download_report/', views.download_product_report, name='download_product_report'),
    path('product/<int:product_id>/update_stock/', views.update_stock, name='update_stock'),

    # SmartDrop Points
    path('smartdrop/', views.smartdrop_list, name='smartdrop_list'),
    path('smartdrop/add/', views.add_smartdrop, name='add_smartdrop'),

    # Delivery Persons
    path('persons/', views.person_list, name='person_list'),
    path('persons/add/', views.add_person, name='add_person'),
    path('persons/<int:person_id>/', views.person_detail, name='person_detail'),
    path('truck_list/', views.truck_list, name='truck_list'),
    path('security/<int:truck_id>/', views.truck_security, name='security'),

]