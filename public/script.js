let chartInstancia = null;
let datosParaPDF = {};

async function cotizarSeguro() {
    const btn = document.getElementById('btnCalcular');
    btn.innerText = 'Calculando proyección...';
    btn.disabled = true;

    try {
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

            // --- LÓGICA DEL PANEL DE IMPACTO ---
            const sumaAsegurada = parseFloat(datosCliente.suma_asegurada);
            const aportacionTotal = parseFloat(datosCliente.prima_mensual) * 12 * 20; // 20 años
            const ultimoAno = datos.proyeccion[datos.proyeccion.length - 1];
            const fondoFinal = ultimoAno.fondo_total;
            const rendimientoEstimado = fondoFinal - aportacionTotal;

            const formatoMoneda = (num) => '$' + num.toLocaleString('es-MX', {minimumFractionDigits: 2, maximumFractionDigits: 2});

            document.getElementById('resSuma').innerText = formatoMoneda(sumaAsegurada);
            document.getElementById('resAportacion').innerText = formatoMoneda(aportacionTotal);
            document.getElementById('resFondo').innerText = formatoMoneda(fondoFinal);
            document.getElementById('resRendimiento').innerText = formatoMoneda(Math.max(rendimientoEstimado, 0));

            document.getElementById('panelResultados').classList.remove('hidden');
            // -----------------------------------

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
        }
    });
}

function descargarPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');

    doc.setFontSize(22);
    doc.setTextColor(0, 86, 179);
    doc.text("Proyección Actuarial Oficial", 105, 20, null, null, "center");
    
    doc.setFontSize(12);
    doc.setTextColor(100);
    doc.text(`Insignia Life - Plan: ${datosParaPDF.producto} (${datosParaPDF.moneda})`, 105, 30, null, null, "center");
    
    doc.setFontSize(11);
    doc.setTextColor(0);
    doc.text("Asegurado: " + datosParaPDF.nombre, 20, 50);
    doc.text("Suma Asegurada: $" + parseFloat(datosParaPDF.suma_asegurada).toLocaleString('es-MX'), 20, 60);
    doc.text("Prima Mensual: $" + parseFloat(datosParaPDF.prima_mensual).toLocaleString('es-MX'), 120, 60);

    const canvas = document.getElementById('graficaProyeccion');
    const imgData = canvas.toDataURL('image/png', 1.0);
    doc.addImage(imgData, 'PNG', 15, 75, 180, 90);

    const ultimoAno = datosParaPDF.resultados[datosParaPDF.resultados.length - 1];
    doc.setFontSize(14);
    doc.setTextColor(0, 86, 179);
    doc.text("Resumen a Largo Plazo (Año " + ultimoAno.ano + ")", 20, 185);
    
    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text("Fondo Objetivo Proyectado: $" + ultimoAno.fondo_total.toLocaleString('es-MX'), 20, 195);
    doc.text("Valor de Rescate Líquido: $" + ultimoAno.valor_rescate.toLocaleString('es-MX'), 20, 205);

    doc.setFontSize(9);
    doc.setTextColor(150);
    doc.text("Generado el " + new Date().toLocaleDateString() + " con fines ilustrativos.", 105, 270, null, null, "center");
    doc.text("Asesor Patrimonial | Documento Confidencial", 105, 280, null, null, "center");

    doc.save("Proyeccion_" + datosParaPDF.nombre.replace(/\s+/g, '_') + ".pdf");
}
