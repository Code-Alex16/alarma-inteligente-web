from flask import Flask, render_template, request, redirect, url_for, jsonify
from flask_sqlalchemy import SQLAlchemy
import os
from datetime import datetime
from twilio.rest import Client

# Configuración de la aplicación Flask
app = Flask(__name__)
app.config.from_object('config.DevelopmentConfig')

# Inicializamos la base de datos
db = SQLAlchemy(app)
# Inicializamos el cliente de Twilio
twilio_client = Client(app.config['TWILIO_ACCOUNT_SID'], app.config['TWILIO_AUTH_TOKEN'])
twilio_phone_number = app.config['TWILIO_PHONE_NUMBER']

# --- Definición de Modelos de Base de Datos ---

# Modelo para el estado de la alarma
class AlarmaEstado(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    activa = db.Column(db.Boolean, default=False, nullable=False)
    ultima_actualizacion = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f'<AlarmaEstado activa={self.activa}>'

# Modelo para la configuración de la alarma (mensajes, métodos de notificación)
class ConfiguracionAlarma(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    mensaje_personalizado = db.Column(db.String(255), default="¡Alerta de intrusión detectada!", nullable=False)
    metodo_notificacion = db.Column(db.String(50), default="SMS", nullable=False) # SMS, WhatsApp
    contacto_emergencia_id = db.Column(db.Integer, db.ForeignKey('contacto_emergencia.id'), nullable=True)
    contacto_emergencia = db.relationship('ContactoEmergencia', backref='configuraciones')
    ultima_actualizacion = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f'<ConfiguracionAlarma id={self.id} metodo={self.metodo_notificacion}>'

# Modelo para los datos del usuario principal
class Usuario(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(100), nullable=False)
    apellido = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(120), unique=True, nullable=False)
    telefono = db.Column(db.String(20), unique=True, nullable=False)
    fecha_registro = db.Column(db.DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f'<Usuario {self.nombre} {self.apellido}>'

# Modelo para los contactos de emergencia
class ContactoEmergencia(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    nombre = db.Column(db.String(100), nullable=False)
    telefono = db.Column(db.String(20), nullable=False)
    fecha_agregado = db.Column(db.DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f'<ContactoEmergencia {self.nombre} ({self.telefono})>'

# Modelo para registrar eventos de alarma (intrusiones, activaciones/desactivaciones)
class EventoAlarma(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    tipo_evento = db.Column(db.String(50), nullable=False) # Ej: 'intrusion', 'activacion', 'desactivacion'
    descripcion = db.Column(db.String(255), nullable=True)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f'<EventoAlarma {self.tipo_evento} at {self.timestamp}>'

# --- Rutas de la aplicación (se mantienen, pero se modificarán para usar la DB) ---

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/configuracion')
def configuracion():
    return render_template('configuracion.html')

@app.route('/perfil')
def perfil():
    return render_template('perfil.html')

# --- API Endpoints ---

# Modificamos este endpoint para interactuar con la DB
@app.route('/api/estado-alarma', methods=['GET', 'POST'])
def handle_estado_alarma():
    # Obtener la única fila del estado de la alarma o crearla si no existe
    estado_alarma_db = AlarmaEstado.query.first()
    if not estado_alarma_db:
        estado_alarma_db = AlarmaEstado(activa=False)
        db.session.add(estado_alarma_db)
        db.session.commit()

    if request.method == 'GET':
        return jsonify({"estado": estado_alarma_db.activa})
    elif request.method == 'POST':
        data = request.get_json()
        nuevo_estado = data.get('estado')
        if nuevo_estado is not None:
            estado_alarma_db.activa = nuevo_estado
            db.session.commit()
            # Opcional: registrar el evento de activación/desactivación
            tipo = 'activacion' if nuevo_estado else 'desactivacion'
            evento = EventoAlarma(tipo_evento=tipo, descripcion=f"Alarma {tipo} desde la web.")
            db.session.add(evento)
            db.session.commit()
            print(f"Estado de alarma actualizado a: {'ACTIVADA' if nuevo_estado else 'DESACTIVADA'}")
            return jsonify({"mensaje": "Estado de alarma actualizado correctamente", "estado": nuevo_estado}), 200
        return jsonify({"mensaje": "Datos inválidos"}), 400

# Endpoint para que el ESP32 envíe una alerta
@app.route('/api/enviar-alerta', methods=['POST'])
def enviar_alerta():
    data = request.get_json()
    evento_tipo = data.get('evento', 'intrusion') # Por defecto es intrusión
    descripcion = data.get('descripcion', 'Alerta generada por el ESP32.')

    # 1. Guardar el evento en la base de datos
    nuevo_evento = EventoAlarma(tipo_evento=evento_tipo, descripcion=descripcion)
    db.session.add(nuevo_evento)
    db.session.commit()

    print(f"Alerta recibida: {evento_tipo} - {descripcion}")

    # 2. Recuperar la configuración de alarma y los datos del usuario/contacto
    configuracion = ConfiguracionAlarma.query.first()
    usuario = Usuario.query.first()

    # Mensaje por defecto si no hay configuración
    mensaje_alerta = configuracion.mensaje_personalizado if configuracion else "¡Alerta de intrusión detectada!"
    # Adjuntar descripción del evento si está presente
    if descripcion and descripcion != 'Alerta generada por el ESP32.':
        mensaje_alerta += f" Descripción: {descripcion}"

    # Determinar a quién enviar el mensaje
    telefonos_a_notificar = []

    if usuario and usuario.telefono:
        telefonos_a_notificar.append(usuario.telefono)

    if configuracion and configuracion.contacto_emergencia:
        if configuracion.contacto_emergencia.telefono not in telefonos_a_notificar: # Evitar duplicados
            telefonos_a_notificar.append(configuracion.contacto_emergencia.telefono)

    if not telefonos_a_notificar:
        print("No hay teléfonos configurados para enviar alertas.")
        return jsonify({"mensaje": "Alerta recibida y registrada, pero no hay teléfonos para notificar."}), 200

    # 3. Enviar mensajes usando Twilio
    mensajes_enviados = []
    for telefono in telefonos_a_notificar:
        try:
            # Determinar el tipo de mensaje (SMS o WhatsApp)
            if configuracion and configuracion.metodo_notificacion == "WhatsApp":
                # Para WhatsApp, el número debe ser 'whatsapp:+NNNNNNNNN'
                to_number = f"whatsapp:{telefono}"
                from_number = f"whatsapp:{twilio_phone_number}"
            else: # Por defecto SMS
                to_number = telefono
                from_number = twilio_phone_number

            message = twilio_client.messages.create(
                to=to_number,
                from_=from_number,
                body=mensaje_alerta
            )
            mensajes_enviados.append(f"Mensaje enviado a {telefono} (SID: {message.sid})")
            print(f"Mensaje enviado a {telefono} via {configuracion.metodo_notificacion}: {message.sid}")
        except Exception as e:
            mensajes_enviados.append(f"Error al enviar mensaje a {telefono}: {str(e)}")
            print(f"Error al enviar mensaje a {telefono}: {e}")

    return jsonify({"mensaje": "Alerta recibida, registrada y notificaciones enviadas.", "detalle_envio": mensajes_enviados}), 200


# --- Nuevos Endpoints para Configuración, Perfil y Contactos (CRUD) ---

# Usuario Principal (Perfil)
@app.route('/api/usuario', methods=['GET', 'POST'])
def handle_usuario():
    usuario = Usuario.query.first() # Asumimos un solo usuario principal

    if request.method == 'GET':
        if usuario:
            return jsonify({
                "nombre": usuario.nombre,
                "apellido": usuario.apellido,
                "email": usuario.email,
                "telefono": usuario.telefono
            })
        return jsonify({"mensaje": "Usuario no configurado"}), 404
    elif request.method == 'POST':
        data = request.get_json()
        if not usuario:
            usuario = Usuario(
                nombre=data['nombre'],
                apellido=data['apellido'],
                email=data['email'],
                telefono=data['telefono']
            )
            db.session.add(usuario)
        else:
            usuario.nombre = data.get('nombre', usuario.nombre)
            usuario.apellido = data.get('apellido', usuario.apellido)
            usuario.email = data.get('email', usuario.email)
            usuario.telefono = data.get('telefono', usuario.telefono)
        db.session.commit()
        return jsonify({"mensaje": "Datos de usuario guardados correctamente"}), 200

# Contactos de Emergencia
@app.route('/api/contactos', methods=['GET', 'POST'])
def handle_contactos():
    if request.method == 'GET':
        contactos = ContactoEmergencia.query.all()
        return jsonify([{
            "id": c.id,
            "nombre": c.nombre,
            "telefono": c.telefono
        } for c in contactos])
    elif request.method == 'POST':
        data = request.get_json()
        nuevo_contacto = ContactoEmergencia(
            nombre=data['nombre'],
            telefono=data['telefono']
        )
        db.session.add(nuevo_contacto)
        db.session.commit()
        return jsonify({"mensaje": "Contacto agregado correctamente", "id": nuevo_contacto.id}), 201

@app.route('/api/contactos/<int:contacto_id>', methods=['PUT', 'DELETE'])
def handle_contacto_individual(contacto_id):
    contacto = ContactoEmergencia.query.get_or_404(contacto_id)

    if request.method == 'PUT':
        data = request.get_json()
        contacto.nombre = data.get('nombre', contacto.nombre)
        contacto.telefono = data.get('telefono', contacto.telefono)
        db.session.commit()
        return jsonify({"mensaje": "Contacto actualizado correctamente"}), 200
    elif request.method == 'DELETE':
        db.session.delete(contacto)
        db.session.commit()
        return jsonify({"mensaje": "Contacto eliminado correctamente"}), 200

# Configuración de la alarma
@app.route('/api/configuracion-alarma', methods=['GET', 'POST'])
def handle_configuracion_alarma():
    configuracion = ConfiguracionAlarma.query.first()
    if not configuracion:
        configuracion = ConfiguracionAlarma() # Valores por defecto
        db.session.add(configuracion)
        db.session.commit()

    if request.method == 'GET':
        contacto_id = configuracion.contacto_emergencia_id
        contacto_nombre = None
        if contacto_id:
            contacto = ContactoEmergencia.query.get(contacto_id)
            if contacto:
                contacto_nombre = contacto.nombre
        return jsonify({
            "mensaje_personalizado": configuracion.mensaje_personalizado,
            "metodo_notificacion": configuracion.metodo_notificacion,
            "contacto_emergencia_id": configuracion.contacto_emergencia_id,
            "contacto_emergencia_nombre": contacto_nombre # Para mostrar en el frontend
        })
    elif request.method == 'POST':
        data = request.get_json()
        configuracion.mensaje_personalizado = data.get('mensaje_personalizado', configuracion.mensaje_personalizado)
        configuracion.metodo_notificacion = data.get('metodo_notificacion', configuracion.metodo_notificacion)
        configuracion.contacto_emergencia_id = data.get('contacto_emergencia_id') # Puede ser None
        db.session.commit()
        return jsonify({"mensaje": "Configuración de alarma guardada correctamente"}), 200

# Asegúrate de que esto siga al final de tu app.py
if __name__ == '__main__':
    with app.app_context():
        db.create_all() # Esto creará todas las tablas definidas si no existen
        # Opcional: Inicializar el estado de la alarma si no existe
        if not AlarmaEstado.query.first():
            db.session.add(AlarmaEstado(activa=False))
            db.session.commit()
        # Opcional: Inicializar la configuración de la alarma si no existe
        if not ConfiguracionAlarma.query.first():
            db.session.add(ConfiguracionAlarma())
            db.session.commit()
    app.run(debug=True, host='0.0.0.0')