# Generated by Django 5.2.1 on 2025-06-30 03:50

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0003_smartdroppoint'),
    ]

    operations = [
        migrations.CreateModel(
            name='DeliveryPerson',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=100)),
                ('current_lat', models.FloatField(blank=True, null=True)),
                ('current_lng', models.FloatField(blank=True, null=True)),
                ('velocity', models.FloatField(default=0)),
                ('accel', models.FloatField(default=0)),
                ('status', models.CharField(choices=[('active', 'Active'), ('inactive', 'Inactive'), ('accident', 'Accident'), ('offline', 'Offline')], default='active', max_length=20)),
                ('last_update', models.DateTimeField(auto_now=True)),
            ],
        ),
        migrations.AddField(
            model_name='delivery',
            name='mode',
            field=models.CharField(choices=[('drone', 'Drone'), ('biker', 'Biker')], default='biker', max_length=20),
        ),
        migrations.CreateModel(
            name='AccidentEvent',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('timestamp', models.DateTimeField(auto_now_add=True)),
                ('details', models.TextField(blank=True)),
                ('delivery', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='accidents', to='inventory.delivery')),
                ('person', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='accidents', to='inventory.deliveryperson')),
            ],
        ),
        migrations.AddField(
            model_name='delivery',
            name='assigned_to',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='deliveries', to='inventory.deliveryperson'),
        ),
    ]
