const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Servir archivos estáticos desde la raíz del proyecto
app.use(express.static(__dirname));

// API Health Check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'OK',
        message: 'Servidor de Supervivencia Zombi 3D funcionando correctamente',
        timestamp: new Date().toISOString()
    });
});

// Ruta raíz sirve el index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`--------------------------------------------------`);
    console.log(`🚀 Servidor iniciado en: http://localhost:${PORT}`);
    console.log(`🏥 Health check: http://localhost:${PORT}/api/health`);
    console.log(`--------------------------------------------------`);
});
