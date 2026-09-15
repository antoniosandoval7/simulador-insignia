let chartInstancia = null;
let datosParaPDF = {};

async function cotizarSeguro() {
    const btn = document.getElementById('btnCalcular');
    btn.innerText = 'Calculando proyección...';
    btn.disabled = true;

    try {
        const anosSeleccionados = parseInt(document.getElementById('anos_proyeccion').value) || 20;

        const datosCliente = {
            nombre: document.getElementById('nombre').value || "Cliente",
            correo: document.getElementById('correo').value || "sin@correo.com",
            whatsapp: document.getElementById('whatsapp').value || "0000000000",
            edad: parseInt(document.getElementById('edad').value),
            sexo: document.getElementById('sexo').value,
            fumador: document.getElementById('fumador').checked,
            suma_asegurada: parseFloat(document.getElementById('suma').value),
            prima_mensual: parseFloat(document.getElementById('prima').value),
            producto: document.getElementById('producto').value,
            moneda: document.getElementById('moneda').value,
            anos_proyeccion: anosSeleccionados,
            sobremortalidad_medica: parseFloat(document.getElementById('riesgo_medico').value)
        };

        const respuesta = await fetch('/.netlify/functions/simulador', {
            method: 'POST',
            body: JSON.stringify(datosCliente)
        });

        const datos = await respuesta.json();

        if (datos.success) {
            dibujarGrafica(datos.proyeccion);
            
            const msj = document.getElementById('mensaje_macro');
            msj.innerText = `Tipos de cambio oficiales aplicados: USD = $${datos.macroeconomia.USD_FIX} MXN | UDI = $${datos.macroeconomia.UDI} MXN`;
            msj.classList.remove('hidden');

            const sumaAsegurada = parseFloat(datosCliente.suma_asegurada);
            const aportacionTotal = parseFloat(datosCliente.prima_mensual) * 12 * anosSeleccionados; 
            const ultimoAno = datos.proyeccion[datos.proyeccion.length - 1];
            const fondoFinal = ultimoAno.fondo_total;
            const rendimientoEstimado = fondoFinal - aportacionTotal;

            const formatoMoneda = (num) => '$' + num.toLocaleString('es-MX', {minimumFractionDigits: 2, maximumFractionDigits: 2});

            document.getElementById('resSuma').innerText = formatoMoneda(sumaAsegurada);
            document.getElementById('resAportacion').innerText = formatoMoneda(aportacionTotal);
            document.getElementById('resFondo').innerText = formatoMoneda(fondoFinal);
            document.getElementById('resRendimiento').innerText = formatoMoneda(Math.max(rendimientoEstimado, 0));

            document.getElementById('tituloResumen').innerText = `Resumen de tu Inversión (A ${anosSeleccionados} Años)`;
            document.getElementById('txtAportacionAnos').innerText = `Lo que inviertes en ${anosSeleccionados} años`;
            document.getElementById('txtFondoAnos').innerText = `Disponible al año ${anosSeleccionados}`;

            document.getElementById('panelResultados').classList.remove('hidden');

            datosParaPDF = { ...datosCliente, resultados: datos.proyeccion, impacto: {sumaAsegurada, aportacionTotal, fondoFinal, rendimientoEstimado} };
            document.getElementById('btnDescargarPDF').classList.remove('hidden');
        } else {
            alert("Error: " + datos.error);
        }
    } catch (error) {
        alert("Error de conexión. Intenta de nuevo.");
    } finally {
        btn.innerText = 'Calcular Proyección';
        btn.disabled = false;
    }
}

function dibujarGrafica(datosProyeccion) {
    const ctx = document.getElementById('graficaProyeccion').getContext('2d');
    const etiquetasAnos = datosProyeccion.map(item => `Año ${item.ano}`);
    const datosFondo = datosProyeccion.map(item => item.fondo_total);
    const datosRescate = datosProyeccion.map(item => item.valor_rescate);

    if (chartInstancia) chartInstancia.destroy();

    // Plugin moderno para asegurar el fondo blanco en el PDF
    const pluginFondoBlanco = {
        id: 'fondoBlancoPersonalizado',
        beforeDraw: (chart) => {
            const ctx = chart.canvas.getContext('2d');
            ctx.save();
            ctx.globalCompositeOperation = 'destination-over';
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, chart.width, chart.height);
            ctx.restore();
        }
    };

    chartInstancia = new Chart(ctx, {
        type: 'line',
        data: {
            labels: etiquetasAnos,
            datasets: [
                { label: 'Fondo Objetivo', data: datosFondo, borderColor: '#0056b3', backgroundColor: 'rgba(0, 86, 179, 0.1)', borderWidth: 3, fill: true, tension: 0.4 },
                { label: 'Valor de Rescate', data: datosRescate, borderColor: '#ff8c00', backgroundColor: 'transparent', borderWidth: 3, borderDash: [5, 5], fill: false, tension: 0.4 }
            ]
        },
        options: {
            responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
            plugins: { tooltip: { callbacks: { label: (c) => c.dataset.label + ': $' + c.parsed.y.toLocaleString('es-MX') } } }
        },
        plugins: [pluginFondoBlanco] // Conectamos el plugin de forma correcta
    });
}

function descargarPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth(); 
    const formatoMoneda = (num) => '$' + num.toLocaleString('es-MX', {minimumFractionDigits: 2, maximumFractionDigits: 2});

    // 1. BANNER SUPERIOR (Azul Corporativo)
    doc.setFillColor(15, 39, 85); 
    doc.rect(0, 0, pageWidth, 35, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text("PROPUESTA DE INVERSIÓN Y PROTECCIÓN", pageWidth / 2, 18, { align: "center" });
    
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text(`Insignia Life - Plan: ${datosParaPDF.producto} (${datosParaPDF.moneda})`, pageWidth / 2, 26, { align: "center" });

    // 2. CAJA DE DATOS DEL CLIENTE (Gris claro)
    doc.setFillColor(248, 250, 252);
    doc.rect(15, 45, 180, 25, 'F');
    doc.setDrawColor(203, 213, 225);
    doc.rect(15, 45, 180, 25, 'S');

    doc.setTextColor(51, 65, 85);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("PERFIL DEL ASEGURADO:", 20, 52);
    doc.setFont("helvetica", "normal");
    doc.text(datosParaPDF.nombre.toUpperCase(), 20, 58);
    doc.text(`Edad: ${datosParaPDF.edad} años | Sexo: ${datosParaPDF.sexo} | Fumador: ${datosParaPDF.fumador ? 'Sí' : 'No'}`, 20, 64);

    doc.setFont("helvetica", "bold");
    doc.text("CONFIGURACIÓN DE PÓLIZA:", 110, 52);
    doc.setFont("helvetica", "normal");
    doc.text(`Protección (Suma): ${formatoMoneda(datosParaPDF.suma_asegurada)}`, 110, 58);
    doc.text(`Aportación Mensual: ${formatoMoneda(datosParaPDF.prima_mensual)}`, 110, 64);

    // 3. PANEL DE IMPACTO (4 Tarjetas tipo Dashbaord)
    const yBox = 80;
    const boxW = 42;
    const gap = 4;
    const impacto = datosParaPDF.impacto;

    const drawBox = (x, title, subtitle, value, colors) => {
        doc.setFillColor(colors[0], colors[1], colors[2]);
        doc.rect(x, yBox, boxW, 25, 'F');
        doc.setDrawColor(colors[3], colors[4], colors[5]);
        doc.rect(x, yBox, boxW, 25, 'S');
        
        doc.setTextColor(51, 65, 85);
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        doc.text(title, x + (boxW/2), yBox + 7, { align: "center" });
        
        doc.setTextColor(colors[6], colors[7], colors[8]);
        doc.setFontSize(10);
        doc.text(formatoMoneda(value), x + (boxW/2), yBox + 15, { align: "center" });
        
        doc.setTextColor(100, 116, 139);
        doc.setFontSize(6);
        doc.setFont("helvetica", "normal");
        doc.text(subtitle, x + (boxW/2), yBox + 21, { align: "center" });
    };

    const cBlue = [239, 246, 255, 191, 219, 254, 29, 78, 216];
    const cGray = [248, 250, 252, 226, 232, 240, 71, 85, 105];
    const cGreen = [240, 253, 244, 187, 247, 208, 21, 128, 61];
    const cYellow = [254, 252, 232, 254, 240, 138, 161, 98, 7];

    drawBox(15, "PROTECCIÓN", "Inmediata", impacto.sumaAsegurada, cBlue);
    drawBox(15 + boxW + gap, "APORTACIÓN", `Total en ${datosParaPDF.anos_proyeccion} años`, impacto.aportacionTotal, cGray);
    drawBox(15 + (boxW + gap)*2, "FONDO ESPERADO", `Disponible al año ${datosParaPDF.anos_proyeccion}`, impacto.fondoFinal, cGreen);
    drawBox(15 + (boxW + gap)*3, "RENDIMIENTO NETO", "Ganancia a favor", Math.max(impacto.rendimientoEstimado, 0), cYellow);

    // 4. GRÁFICA
    doc.setTextColor(15, 39, 85);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(`Proyección de Crecimiento a ${datosParaPDF.anos_proyeccion} Años`, pageWidth / 2, yBox + 40, { align: "center" });

    const canvas = document.getElementById('graficaProyeccion');
    const imgData = canvas.toDataURL('image/png', 1.0);
    doc.addImage(imgData, 'PNG', 15, yBox + 45, 180, 90);

    // 5. FOOTER CORPORATIVO
    doc.setDrawColor(203, 213, 225);
    doc.line(15, 275, 195, 275);
    
    doc.setTextColor(148, 163, 184);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text("Las cantidades presentadas son estimaciones basadas en rendimientos proyectados y no constituyen un contrato.", pageWidth / 2, 282, { align: "center" });
    doc.text(`Documento generado el ${new Date().toLocaleDateString()} | Plataforma Exclusiva para Asesores Patrimoniales`, pageWidth / 2, 287, { align: "center" });

    doc.save(`Propuesta_${datosParaPDF.nombre.replace(/\s+/g, '_')}.pdf`);
}
