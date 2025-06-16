from django.shortcuts import render
from django.http import Http404

def dynamic_render(request, page):
    template_name = f"{page}.html"
    return render(request, template_name)


def index(request):
    return render(request, 'home.html')
    