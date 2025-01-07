import functools
import time


def print_runtime(func):
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        start_time = time.time()
        result = func(*args, **kwargs)
        end_time = time.time()
        runtime = end_time - start_time
        print(f"{func.__name__} took {runtime:.6f} seconds")
        return result

    return wrapper


def show_toolbar_callback(request):
    return request.user.is_superuser
