import os
import docx
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import qn, nsdecls

def create_document():
    doc = docx.Document()

    # Configuración de márgenes (2 cm = aprox 0.787 pulgadas)
    for section in doc.sections:
        section.top_margin = Inches(0.75)
        section.bottom_margin = Inches(0.75)
        section.left_margin = Inches(0.8)
        section.right_margin = Inches(0.8)

    # Colores de la paleta institucional Buffali
    COLOR_AZUL_BUFFALI = RGBColor(18, 58, 148)     # #123A94
    COLOR_AZUL_OSCURO = RGBColor(17, 16, 22)       # #111016
    COLOR_GRIS_TEXTO = RGBColor(51, 65, 85)        # #334155
    COLOR_GRIS_CLARO = "F8FAFC"
    COLOR_AZUL_CLARO = "EFF6FF"
    COLOR_BORDE = "CBD5E1"
    COLOR_ENCABEZADO = "123A94"

    # Estilos de texto por defecto
    normal_style = doc.styles['Normal']
    normal_style.font.name = 'Calibri'
    normal_style.font.size = Pt(11)
    normal_style.font.color.rgb = COLOR_GRIS_TEXTO
    normal_style.paragraph_format.line_spacing = 1.15
    normal_style.paragraph_format.space_after = Pt(6)

    def set_cell_shading(cell, color_hex):
        shading = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{color_hex}"/>')
        cell._tc.get_or_add_tcPr().append(shading)

    def set_cell_margins(cell, top=100, bottom=100, left=150, right=150):
        tcPr = cell._tc.get_or_add_tcPr()
        tcMar = parse_xml(f'<w:tcMar {nsdecls("w")}>'
                          f'<w:top w:w="{top}" w:type="dxa"/>'
                          f'<w:bottom w:w="{bottom}" w:type="dxa"/>'
                          f'<w:left w:w="{left}" w:type="dxa"/>'
                          f'<w:right w:w="{right}" w:type="dxa"/>'
                          f'</w:tcMar>')
        tcPr.append(tcMar)

    def set_table_borders(table, color="CBD5E1"):
        tblPr = table._tbl.tblPr
        borders = parse_xml(
            f'<w:tblBorders {nsdecls("w")}>'
            f'  <w:top w:val="single" w:sz="4" w:space="0" w:color="{color}"/>'
            f'  <w:bottom w:val="single" w:sz="6" w:space="0" w:color="{color}"/>'
            f'  <w:insideH w:val="single" w:sz="4" w:space="0" w:color="{color}"/>'
            f'  <w:insideV w:val="none"/>'
            f'  <w:left w:val="none"/>'
            f'  <w:right w:val="none"/>'
            f'</w:tblBorders>'
        )
        tblPr.append(borders)

    def add_callout(text, title="CONSEJO PRÁCTICO", bg="EFF6FF", border_color="123A94"):
        tbl = doc.add_table(rows=1, cols=1)
        tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
        tbl.autofit = False
        cell = tbl.cell(0, 0)
        cell.width = Inches(6.8)
        set_cell_shading(cell, bg)
        set_cell_margins(cell, top=140, bottom=140, left=200, right=160)

        # Borde izquierdo grueso
        tcPr = cell._tc.get_or_add_tcPr()
        tcBorders = parse_xml(
            f'<w:tcBorders {nsdecls("w")}>'
            f'  <w:left w:val="single" w:sz="24" w:space="0" w:color="{border_color}"/>'
            f'  <w:top w:val="none"/>'
            f'  <w:bottom w:val="none"/>'
            f'  <w:right w:val="none"/>'
            f'</w:tcBorders>'
        )
        tcPr.append(tcBorders)

        p = cell.paragraphs[0]
        p.paragraph_format.space_after = Pt(2)
        r_t = p.add_run(f"💡 {title}\n")
        r_t.bold = True
        r_t.font.size = Pt(10)
        r_t.font.color.rgb = COLOR_AZUL_BUFFALI

        r_body = p.add_run(text)
        r_body.font.size = Pt(10)
        r_body.font.color.rgb = COLOR_GRIS_TEXTO

        # Espacio después del callout
        p_sp = doc.add_paragraph()
        p_sp.paragraph_format.space_before = Pt(4)
        p_sp.paragraph_format.space_after = Pt(6)

    def add_heading_1(text):
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(18)
        p.paragraph_format.space_after = Pt(6)
        p.paragraph_format.keep_with_next = True
        r = p.add_run(text)
        r.font.name = 'Calibri'
        r.font.size = Pt(18)
        r.bold = True
        r.font.color.rgb = COLOR_AZUL_BUFFALI

        # Línea divisoria decorativa
        p_line = doc.add_paragraph()
        p_line.paragraph_format.space_before = Pt(0)
        p_line.paragraph_format.space_after = Pt(10)
        p_line.paragraph_format.keep_with_next = True
        p_line_border = parse_xml(f'<w:pBdr {nsdecls("w")}><w:bottom w:val="single" w:sz="12" w:space="1" w:color="123A94"/></w:pBdr>')
        p_line._p.get_or_add_pPr().append(p_line_border)

    def add_heading_2(text):
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(14)
        p.paragraph_format.space_after = Pt(4)
        p.paragraph_format.keep_with_next = True
        r = p.add_run(text)
        r.font.name = 'Calibri'
        r.font.size = Pt(13)
        r.bold = True
        r.font.color.rgb = COLOR_AZUL_BUFFALI

    def add_image_box(img_path, caption):
        if os.path.exists(img_path):
            p_img = doc.add_paragraph()
            p_img.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p_img.paragraph_format.space_before = Pt(8)
            p_img.paragraph_format.space_after = Pt(3)
            p_img.paragraph_format.keep_with_next = True
            run_img = p_img.add_run()
            run_img.add_picture(img_path, width=Inches(6.4))

            p_cap = doc.add_paragraph()
            p_cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p_cap.paragraph_format.space_before = Pt(0)
            p_cap.paragraph_format.space_after = Pt(12)
            p_cap.paragraph_format.keep_with_next = True
            r_cap = p_cap.add_run(f"Figura: {caption}")
            r_cap.font.size = Pt(9.5)
            r_cap.font.italic = True
            r_cap.font.color.rgb = RGBColor(100, 116, 139)

    def add_button_table(data):
        """
        data es una lista de tuplas: (Nombre Botón/Elemento, Para qué sirve / Qué hace)
        """
        tbl = doc.add_table(rows=len(data) + 1, cols=2)
        tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
        tbl.autofit = False
        set_table_borders(tbl, COLOR_BORDE)

        col_widths = [Inches(2.2), Inches(4.6)]

        # Encabezado
        headers = ["Botón o Elemento", "¿Para qué sirve y qué hace al presionarlo?"]
        for c_idx, h_text in enumerate(headers):
            cell = tbl.cell(0, c_idx)
            cell.width = col_widths[c_idx]
            set_cell_shading(cell, COLOR_ENCABEZADO)
            set_cell_margins(cell, top=120, bottom=120, left=140, right=140)
            p = cell.paragraphs[0]
            p.paragraph_format.space_after = Pt(0)
            r = p.add_run(h_text)
            r.bold = True
            r.font.size = Pt(10)
            r.font.color.rgb = RGBColor(255, 255, 255)

        # Filas de contenido
        for r_idx, (btn_name, btn_desc) in enumerate(data, start=1):
            bg = COLOR_GRIS_CLARO if r_idx % 2 == 0 else "FFFFFF"
            
            c0 = tbl.cell(r_idx, 0)
            c0.width = col_widths[0]
            set_cell_shading(c0, bg)
            set_cell_margins(c0, top=100, bottom=100, left=140, right=140)
            p0 = c0.paragraphs[0]
            p0.paragraph_format.space_after = Pt(0)
            r0 = p0.add_run(btn_name)
            r0.bold = True
            r0.font.size = Pt(9.5)
            r0.font.color.rgb = COLOR_AZUL_BUFFALI

            c1 = tbl.cell(r_idx, 1)
            c1.width = col_widths[1]
            set_cell_shading(c1, bg)
            set_cell_margins(c1, top=100, bottom=100, left=140, right=140)
            p1 = c1.paragraphs[0]
            p1.paragraph_format.space_after = Pt(0)
            r1 = p1.add_run(btn_desc)
            r1.font.size = Pt(9.5)
            r1.font.color.rgb = COLOR_GRIS_TEXTO

        p_sp = doc.add_paragraph()
        p_sp.paragraph_format.space_after = Pt(8)

    # ==========================================
    # 1. PORTADA / ENCABEZADO PRINCIPAL
    # ==========================================
    logo_path = os.path.join(os.getcwd(), 'public', 'logo.png')
    if os.path.exists(logo_path):
        p_logo = doc.add_paragraph()
        p_logo.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p_logo.paragraph_format.space_before = Pt(10)
        p_logo.paragraph_format.space_after = Pt(10)
        r_logo = p_logo.add_run()
        r_logo.add_picture(logo_path, width=Inches(3.2))

    p_title = doc.add_paragraph()
    p_title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_title.paragraph_format.space_after = Pt(4)
    r_t = p_title.add_run("GUÍA DE USO Y MANUAL DE BOTONES")
    r_t.font.name = 'Calibri'
    r_t.font.size = Pt(22)
    r_t.bold = True
    r_t.font.color.rgb = COLOR_AZUL_BUFFALI

    p_sub = doc.add_paragraph()
    p_sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_sub.paragraph_format.space_after = Pt(18)
    r_s = p_sub.add_run("Sistema Web de Historial de Vehículos · Suspensión Buffali\n")
    r_s.font.size = Pt(13)
    r_s.font.color.rgb = COLOR_GRIS_TEXTO
    r_ver = p_sub.add_run("Manual claro, rápido y sencillo para el cliente y el personal del taller")
    r_ver.font.size = Pt(10.5)
    r_ver.font.italic = True
    r_ver.font.color.rgb = RGBColor(100, 116, 139)

    add_callout(
        "Este manual explica de forma directa cómo funciona cada sección de la plataforma, cómo ingresar una consulta y para qué sirve cada botón. "
        "El sistema tiene dos módulos: 1) La vista pública de consulta para el cliente (donde ve el estado de su auto en vivo) y 2) El panel de control del taller (para gestionar ingresos, avisar por WhatsApp y llevar el registro de reparaciones).",
        title="¿QUÉ ES ESTE SISTEMA Y PARA QUÉ SIRVE?"
    )

    # ==========================================
    # 2. PARTE 1: VISTA DEL CLIENTE
    # ==========================================
    add_heading_1("Parte 1: Vista del Cliente (Consulta de Historial)")

    p_intro_c = doc.add_paragraph()
    p_intro_c.add_run(
        "El cliente puede consultar el estado de su auto de dos formas muy simples:\n"
        "1. Abriendo el enlace directo que el taller le envía por WhatsApp (ej. historial.buffali.com.ar/?p=AE482KD), el cual abre directamente la ficha de su auto sin escribir nada.\n"
        "2. Ingresando a la página web y escribiendo su patente en la pantalla principal."
    )

    add_heading_2("1.1. Pantalla de Búsqueda de Vehículo")
    doc.add_paragraph("Al ingresar a la dirección principal de la página, el cliente se encuentra con la pantalla de consulta:")

    add_image_box(os.path.join(os.getcwd(), 'capturas_doc', '01_consulta_inicio.png'), "Pantalla inicial de consulta para clientes")

    add_button_table([
        ("Campo Patente (Chapa interactiva)", "Permite escribir la patente del vehículo. Diseñado con el formato oficial de patente argentina. Admite mayúsculas y minúsculas sin importar si se ponen espacios; el sistema le da formato automático."),
        ("Botón [Ver historial]", "Al tocar este botón, el sistema busca el vehículo de forma instantánea y muestra si está listo para retirar, los trabajos que se le hicieron y su fecha de ingreso."),
        ("Tarjeta de Información del Taller", "Muestra la dirección física (Humberto Primo 773, Río Cuarto), teléfono de atención y horario comercial para tranquilidad del cliente.")
    ])

    add_heading_2("1.2. Resultado de Consulta: Estado e Historial del Vehículo")
    doc.add_paragraph("Una vez ingresada la patente, el cliente accede a la ficha detallada de su auto:")

    add_image_box(os.path.join(os.getcwd(), 'capturas_doc', '02_consulta_resultado.png'), "Ficha en vivo del vehículo con estado, trabajos e historial")

    add_button_table([
        ("Cartel de Estado (Verde / Naranja)", "Informa con máxima claridad la situación del auto: \n• Naranja ('En el taller'): Se encuentra actualmente en reparación o diagnóstico.\n• Verde ('Listo para retirar'): El trabajo ya concluyó y el cliente puede pasar a buscarlo."),
        ("Tarjetas de Resumen (Visitas / Km / Próximo control)", "Muestra la cantidad histórica de visitas al taller, el último kilometraje registrado y el kilometraje o fecha estimada para el próximo service."),
        ("Línea de Tiempo de Trabajos", "Muestra cada visita histórica con: fecha de entrada y salida, días de estadía, etiquetas con los trabajos realizados (amortiguadores, alineación, tren delantero, etc.), cambio de cubiertas y las observaciones escritas por el mecánico."),
        ("Botón [← Volver a consultar] / [Consultar otra patente]", "Permite borrar la consulta actual y volver a la pantalla inicial para buscar otro vehículo de la familia o empresa."),
        ("Botón [Escribir por WhatsApp]", "Abre un chat directo de WhatsApp con el taller, con un mensaje predeterminado que ya incluye la patente del auto para hacer cualquier pregunta al instante."),
        ("Botón [Llamar (0358) 462-4013]", "Permite discar automáticamente desde el celular al teléfono del taller con un solo toque."),
        ("Botón [Cómo llegar]", "Abre la aplicación de Google Maps con la ruta hacia el taller en Humberto Primo 773.")
    ])

    add_callout(
        "Por seguridad y privacidad del cliente, en la página pública no se muestran datos sensibles ni números telefónicos; únicamente los datos del rodado y el detalle de mantenimiento realizado.",
        title="PRIVACIDAD ASEGURADA"
    )

    # ==========================================
    # 3. PARTE 2: PANEL DEL TALLER
    # ==========================================
    add_heading_1("Parte 2: Panel de Gestión para el Taller (/panel)")

    doc.add_paragraph(
        "Esta sección es privada para los mecánicos y encargados del taller. Permite registrar autos nuevos, cargar ingresos de mantenimiento, "
        "actualizar estados y notificar al cliente por WhatsApp cuando su vehículo está listo."
    )

    add_heading_2("2.1. Inicio de Sesión (Login)")
    doc.add_paragraph("Para acceder al panel se ingresa a la ruta /panel:")

    add_image_box(os.path.join(os.getcwd(), 'capturas_doc', '03_login.png'), "Pantalla de inicio de sesión para el personal del taller")

    add_button_table([
        ("Campos Usuario y Clave", "Espacios para colocar las credenciales individuales de acceso asignadas al personal del taller."),
        ("Botón [Entrar]", "Valida las credenciales y da acceso inmediato al panel de administración.")
    ])

    add_heading_2("2.2. Pestaña: 'En el taller ahora'")
    doc.add_paragraph("Es la vista operativa principal al iniciar la jornada. Muestra todos los vehículos que se encuentran actualmente en las instalaciones:")

    add_image_box(os.path.join(os.getcwd(), 'capturas_doc', '04_panel_en_taller.png'), "Panel de vehículos en reparación o diagnóstico en el taller")

    add_button_table([
        ("Pestaña [En el taller ahora] (con número)", "Muestra el listado de vehículos que se están reparando hoy. El número indica la cantidad exacta de autos en espera o trabajo."),
        ("Pestaña [Listos para retirar] (con número)", "Agrupa todos los vehículos terminados que están esperando que el cliente los venga a buscar."),
        ("Pestaña [Historial de vehículos] (con número)", "Archivo general con el registro histórico de todos los autos entregados."),
        ("Botón [+ Cargar ingreso]", "Abre el formulario para registrar un vehículo nuevo que ingresa por primera vez al taller, o cargar un nuevo servicio."),
        ("Selector desplegable de Estado", "Permite cambiar el estado del vehículo en 1 segundo: de 'En el taller' a 'Listo para retirar' o 'Entregado' sin entrar a formularios largos."),
        ("Tarjeta / Chapa de cada auto", "Al tocar la patente o los datos del vehículo, se abre la ficha completa con todo su historial."),
        ("Botón [Salir]", "Cierra la sesión de usuario activa protegiendo la información del taller.")
    ])

    add_heading_2("2.3. Pestaña: 'Listos para retirar' (Aviso por WhatsApp)")
    doc.add_paragraph("Cuando se termina la reparación, el auto pasa a esta sección para coordinar la entrega con el cliente:")

    add_image_box(os.path.join(os.getcwd(), 'capturas_doc', '05_panel_listos.png'), "Pestaña de vehículos listos para retirar con botón de WhatsApp")

    add_button_table([
        ("Botón destacado [Avisar por WhatsApp]", "¡El botón más potente del taller! Con un solo clic abre WhatsApp Web o la app en el teléfono con un mensaje personalizado listo para enviar. El mensaje incluye: nombre del cliente, vehículo, patente, lista de tareas realizadas, total a abonar (si se cargó) y dirección y horarios para retirarlo."),
        ("Selector de Estado a [Entregado]", "Cuando el cliente se presenta a retirar la unidad y abonar, se selecciona 'Entregado'. El sistema guarda automáticamente la fecha y hora de salida de hoy y el auto se archiva en el historial.")
    ])

    add_heading_2("2.4. Pestaña: 'Historial de vehículos'")
    doc.add_paragraph("Archivo general para consultar antecedentes o recibir a un cliente que regresa al taller:")

    add_image_box(os.path.join(os.getcwd(), 'capturas_doc', '06_panel_historial.png'), "Buscador y archivo completo de vehículos entregados")

    add_button_table([
        ("Campo de Búsqueda rápida", "Permite escribir una patente, apellido del cliente o modelo. Filtra instantáneamente sin recargar la página."),
        ("Botón [+ Cargar ingreso] (por vehículo)", "Permite registrar un reingreso en 1 segundo para un cliente frecuente, sin tener que volver a cargar sus datos personales.")
    ])

    add_heading_2("2.5. Ficha Detallada del Vehículo")
    doc.add_paragraph("Al tocar cualquier vehículo en la lista, se abre su expediente completo:")

    add_image_box(os.path.join(os.getcwd(), 'capturas_doc', '07_ficha_vehiculo.png'), "Ficha individual con acciones de edición e historial")

    add_button_table([
        ("Botón [Editar ingreso actual]", "Abre el formulario para agregar o quitar trabajos realizados, actualizar el kilometraje o modificar las observaciones del servicio en curso."),
        ("Botón [Editar datos]", "Permite corregir o actualizar la información del vehículo (patente, marca, modelo, año, color) y del titular (nombre y teléfono celular)."),
        ("Botón [WhatsApp]", "Abre una conversación de WhatsApp vacía con el titular del vehículo para cualquier consulta rápida."),
        ("Botón [Registrar otro ingreso]", "Agrega una nueva visita al historial del auto conservando las anteriores."),
        ("Botón [Editar] (en cada visita previa)", "Permite rectificar detalles de servicios realizados en meses o años anteriores.")
    ])

    add_heading_2("2.6. Ventana de Carga de Ingreso (Modal de Servicio)")
    doc.add_paragraph("Al cargar un ingreso o editar un servicio, se abre esta ventana emergente rápida:")

    add_image_box(os.path.join(os.getcwd(), 'capturas_doc', '08_modal_nuevo_ingreso.png'), "Formulario de carga de trabajos, kilometraje y notas")

    add_button_table([
        ("Fechas de Entrada y Salida", "Fecha en que el rodado ingresó al taller y fecha en que se retiró (se completa sola al entregar)."),
        ("Kilometraje e Importe", "Permite registrar los kilómetros actuales (avisa si es menor al anterior por seguridad) y el costo total de la mano de obra y repuestos."),
        ("Casillas de Trabajos Frecuentes", "Permite tildar con un clic los trabajos habituales: amortiguadores delanteros/traseros, bujes, alineación, balanceo, frenos, rótulas, etc."),
        ("Campo [+ Otro trabajo]", "Permite escribir cualquier trabajo especial no contemplado en la lista (ej. cambio de rulemán) y agregarlo con solo apretar Enter."),
        ("Casilla [Se hizo cambio de gomas]", "Al tildarla, abre un campo específico para detallar marca, rodado y cantidad de cubiertas nuevas instaladas."),
        ("Observaciones para el cliente", "Texto explicativo que se mostrará en la web pública del cliente (ej. 'Se reemplazaron bujes y se controló tren delantero')."),
        ("Notas internas (Privadas)", "Anotaciones confidenciales exclusivas para el taller (ej. 'Repuestos comprados en Distribuidora X, costo $45.000'). El cliente NO las ve."),
        ("Campos Próximo Control", "Permite agendar el kilometraje o fecha estimada para el próximo chequeo preventivo."),
        ("Botón [Guardar ingreso]", "Guarda todos los datos y actualiza inmediatamente la ficha del auto y la web del cliente."),
        ("Botón [Cancelar]", "Cierra la ventana sin modificar nada."),
        ("Botón [Eliminar ingreso]", "Permite borrar un ingreso erróneo (solicita confirmación para evitar borrados accidentales).")
    ])

    # ==========================================
    # 4. RESUMEN EN 4 PASOS
    # ==========================================
    add_heading_1("Resumen: El Circuito Diario del Taller en 4 Pasos")

    doc.add_paragraph(
        "Para que la atención sea ágil, ordenada y profesional, el circuito diario de trabajo se resume en 4 pasos claros:"
    )

    tbl_pasos = doc.add_table(rows=5, cols=2)
    tbl_pasos.alignment = WD_TABLE_ALIGNMENT.CENTER
    tbl_pasos.autofit = False
    set_table_borders(tbl_pasos, COLOR_BORDE)

    pasos_data = [
        ("Paso 1: Recepción", "Llega el auto. En el panel se busca la patente en el buscador o se toca '+ Cargar ingreso'. Si el auto ya vino antes, sus datos ya están listos; si es nuevo, se cargan marca, modelo, cliente y WhatsApp."),
        ("Paso 2: Registro del Servicio", "Se carga el kilometraje y se tildan los trabajos a realizar en la lista rápida. El auto queda con estado 'En el taller'."),
        ("Paso 3: Notificación de Finalización", "Cuando el mecánico termina el auto, se cambia el estado a 'Listo para retirar' y se presiona el botón 'Avisar por WhatsApp'. El cliente recibe al instante el mensaje con el detalle de trabajos y horario de retiro."),
        ("Paso 4: Entrega del Rodado", "Cuando el cliente retira el vehículo, se selecciona el estado 'Entregado'. La fecha de salida se guarda sola y el servicio pasa al historial permanente.")
    ]

    # Encabezado
    h0 = tbl_pasos.cell(0, 0)
    h0.width = Inches(1.8)
    set_cell_shading(h0, COLOR_ENCABEZADO)
    set_cell_margins(h0, top=120, bottom=120, left=140, right=140)
    p_h0 = h0.paragraphs[0]
    p_h0.paragraph_format.space_after = Pt(0)
    r_h0 = p_h0.add_run("Paso")
    r_h0.bold = True
    r_h0.font.color.rgb = RGBColor(255, 255, 255)

    h1 = tbl_pasos.cell(0, 1)
    h1.width = Inches(5.0)
    set_cell_shading(h1, COLOR_ENCABEZADO)
    set_cell_margins(h1, top=120, bottom=120, left=140, right=140)
    p_h1 = h1.paragraphs[0]
    p_h1.paragraph_format.space_after = Pt(0)
    r_h1 = p_h1.add_run("Acción a realizar en el sistema")
    r_h1.bold = True
    r_h1.font.color.rgb = RGBColor(255, 255, 255)

    for idx, (p_nom, p_act) in enumerate(pasos_data, start=1):
        bg = COLOR_GRIS_CLARO if idx % 2 == 0 else "FFFFFF"
        c0 = tbl_pasos.cell(idx, 0)
        c0.width = Inches(1.8)
        set_cell_shading(c0, bg)
        set_cell_margins(c0, top=100, bottom=100, left=140, right=140)
        p0 = c0.paragraphs[0]
        p0.paragraph_format.space_after = Pt(0)
        r0 = p0.add_run(p_nom)
        r0.bold = True
        r0.font.size = Pt(10)
        r0.font.color.rgb = COLOR_AZUL_BUFFALI

        c1 = tbl_pasos.cell(idx, 1)
        c1.width = Inches(5.0)
        set_cell_shading(c1, bg)
        set_cell_margins(c1, top=100, bottom=100, left=140, right=140)
        p1 = c1.paragraphs[0]
        p1.paragraph_format.space_after = Pt(0)
        r1 = p1.add_run(p_act)
        r1.font.size = Pt(9.5)
        r1.font.color.rgb = COLOR_GRIS_TEXTO

    p_sp = doc.add_paragraph()
    p_sp.paragraph_format.space_before = Pt(10)

    add_callout(
        "¡Listo! Con estos simples pasos el taller mantiene su historial impecable, organizado y fideliza a sus clientes brindándoles transparencia y comodidad.",
        title="BENEFICIO PARA EL TALLER Y EL CLIENTE"
    )

    out_file = os.path.join(os.getcwd(), "Guia_de_Uso_Sistema_Buffali.docx")
    doc.save(out_file)
    print(f"Documento Word guardado exitosamente en: {out_file}")

if __name__ == "__main__":
    create_document()
