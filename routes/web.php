cat > routes/web.php << 'EOF'
<?php

use Illuminate\Support\Facades\Route;

Route::redirect('/', '/app/index.html');
Route::redirect('/app', '/app/index.html');
