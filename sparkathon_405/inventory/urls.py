from django.urls import path
from . import views

urlpatterns = [
    path('', views.retailer_list, name='retailer_list'),
    path('retailer/<int:retailer_id>/products/', views.product_list, name='product_list'),
    path('retailer/<int:retailer_id>/add_product/', views.add_product, name='add_product'),
    path('product/<int:product_id>/simulate_order/', views.simulate_order, name='simulate_order'),
    path('product/<int:product_id>/analytics/', views.product_analytics, name='product_analytics'),
    path('product/<int:product_id>/download_report/', views.download_product_report, name='download_product_report'),
    path('product/<int:product_id>/update_stock/', views.update_stock, name='update_stock'),

]