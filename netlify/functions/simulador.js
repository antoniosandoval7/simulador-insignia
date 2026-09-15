const nodemailer = require("nodemailer");

async function obtenerMacro() {
    const token = process.env.BANXICO_TOKEN || '';
    const fallback = { UDI: 8.50, USD_FIX: 19.50 };
    if (!token) return fallback;

    try {
        const fetchSerie = async (id, fb) => {
            const res = await fetch(`https://www.banxico.org.mx/SieAPIRest/service/v1/series/${id}/datos/oportuno`, {
                headers: { 'Bmx-Token': token }
            });
            if (res.ok) {
                const data = await res.json();
                return parseFloat(data.bmx.series[0].datos[0].dato);
            }
            return fb;
        };
        const udi = await fetchSerie('SP68257', fallback.UDI);
        const usd = await fetchSerie('SF43718', fallback.USD_FIX);
        return { UDI: udi, USD_FIX: usd };
    } catch (e) {
        return fallback;
    }
}

function proyectarSeguro(datos, factor) {
    const edad = parseInt(datos.edad || 30);
    const sexo = (datos.sexo || 'M').toUpperCase();
    const fumador = (datos.fumador === true || datos.fumador === "true");
    const suma = parseFloat(datos.suma_asegurada || 1000000) * factor;
    const prima = parseFloat(datos.prima_mensual || 2000) * factor;
    const riesgoMedico = parseFloat(datos.sobremortalidad_medica || 0.0);
    const producto = datos.producto || 'Universal';
    const anosProyeccion = parseInt(datos.anos_proyeccion || 20);
    const mesesTotales = anosProyeccion * 12;
    
    let edadAjustada = edad;
    if (sexo === 'F') edadAjustada -= 3;
    if (!fumador) edadAjustada -= 2;
    const edadCalculo = Math.max(15, edadAjustada);

    let tasaMensual = Math.pow(1 + 0.045, 1/12) - 1;
    if (producto !== 'Universal') {
        tasaMensual = Math.pow(1 + Math.min(tasaMensual * 12, 0.01), 1/12) - 1;
    }

    let fondo = 0.0;
    let proyeccion = [];

    for (let mes = 1; mes <= mesesTotales; mes++) {
        fondo += prima;
        fondo *= (1 + tasaMensual);
        let mnr = Math.max(suma - fondo, 0.05 * fondo);

        let factorEdad = (edadCalculo + Math.floor(mes / 12)) * 0.000012;
        let q_x = 0.0004527 + factorEdad;
        let coi = (mnr * q_x) * (1 + riesgoMedico);
        
        let gastoAdmin = mes <= 12 ? (prima * 0.376) : 7.50;
        
        fondo -= (coi + gastoAdmin);
        if (fondo <= 0) fondo = 0.0;

        let ano = Math.floor((mes - 1) / 12) + 1;
        let castigo = 0;
        if (producto === 'Universal') {
            if (ano <= 2) castigo = 1.00;
            else if (ano === 3) castigo = 0.77;
            else if (ano === 4) castigo = 0.57;
            else if (ano === 5) castigo = 0.37;
            else if (ano < 10) castigo = Math.max(0.0, 0.37 - ((ano - 5) * 0.074));
        } else {
            if (ano === 1) castigo = 0.53;
            else if (ano === 2) castigo = 0.34;
            else if (ano <= 5) castigo = Math.max(0.0, 0.34 - ((ano - 2) * 0.11));
        }
        
        let rescate = fondo * (1 - castigo);

        if (mes % 12 === 0) {
            proyeccion.push({
                ano: ano,
                fondo_total: parseFloat((fondo / factor).toFixed(2)),
                valor_rescate: parseFloat((rescate / factor).toFixed(2))
            });
        }
    }
    return proyeccion;
}

exports.handler = async function(event, context) {
    if (event.httpMethod !== "POST") return { statusCode: 405, body: "Metodo no permitido" };

    try {
        const body = JSON.parse(event.body || "{}");
        const macro = await obtenerMacro();
        
        let factor = 1.0;
        if (body.moneda === 'USD') factor = macro.USD_FIX;
        else if (body.moneda === 'UDIS') factor = macro.UDI;

        const resultados = proyectarSeguro(body, factor);
        
        const user = process.env.EMAIL_USUARIO;
        const pass = process.env.EMAIL_PASSWORD;
        const dest = process.env.EMAIL_DESTINO;

        if (user && pass && dest) {
            let transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: user, pass: pass }});
            await transporter.sendMail({
                from: user,
                to: dest,
                subject: `🔥 Nuevo Lead: ${body.nombre}`,
                text: `Nombre: ${body.nombre}\nWhatsApp: ${body.whatsapp}\nCorreo: ${body.correo}\nCotizó: ${body.producto} por $${body.suma_asegurada} ${body.moneda} a ${body.anos_proyeccion} años.`
            });
        }

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ success: true, macroeconomia: macro, proyeccion: resultados })
        };
    } catch (error) {
        return { statusCode: 400, body: JSON.stringify({ success: false, error: error.message }) };
    }
};
