import os

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY') or '' # Cambiar por una clave segura en producción
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    # --- Configuración de Twilio ---
    TWILIO_ACCOUNT_SID = os.environ.get('TWILIO_ACCOUNT_SID') or '' # Tu Account SID de Twilio
    TWILIO_AUTH_TOKEN = os.environ.get('TWILIO_AUTH_TOKEN') or '' # Tu Auth Token de Twilio
    TWILIO_PHONE_NUMBER = os.environ.get('TWILIO_PHONE_NUMBER') or '' # Tu número de Twilio (formato E.164)

class DevelopmentConfig(Config):
    DEBUG = True
    SQLALCHEMY_DATABASE_URI = 'mysql+pymysql://root:root123456@localhost/sistema_alarma' # Cambia 'tu_password' y 'alarma_db'

class ProductionConfig(Config):
    DEBUG = False
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or 'mysql+pymysql://root:root123456@localhost/sistema_alarma' # Configuraciones para producción