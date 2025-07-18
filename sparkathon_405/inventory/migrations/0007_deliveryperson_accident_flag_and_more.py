# Generated by Django 5.2.1 on 2025-06-30 05:12

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0006_deliveryperson_mimic_accident'),
    ]

    operations = [
        migrations.AddField(
            model_name='deliveryperson',
            name='accident_flag',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='deliveryperson',
            name='accident_time',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
