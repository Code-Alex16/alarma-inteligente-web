document.addEventListener('DOMContentLoaded', function() {
    // --- Elementos del DOM ---
    const alarmaToggle = document.getElementById('alarmaToggle');
    const estadoAlarmaTexto = document.getElementById('estadoAlarmaTexto');
    const mensajeSistema = document.getElementById('mensajeSistema');

    const formPerfil = document.getElementById('formPerfil');
    const formContactoEmergencia = document.getElementById('formContactoEmergencia');
    const listaContactos = document.getElementById('listaContactos');

    const formConfiguracion = document.getElementById('formConfiguracion');
    const selectContactoEmergencia = document.getElementById('contactoEmergencia');

    // --- Funciones Globales de Utilidad ---
    function mostrarMensaje(elemento, mensaje, tipo = 'info') {
        // Asegurarse de que el elemento existe antes de intentar modificarlo
        if (!elemento) {
            console.warn("Elemento para mostrar mensaje no encontrado:", elemento);
            return;
        }
        const mensajeDisplay = elemento.tagName === 'BUTTON' ? elemento.parentElement : elemento; // Muestra el mensaje cerca del botón o en el elemento
        const pMensaje = mensajeDisplay.querySelector('.feedback-message') || document.createElement('p');
        pMensaje.className = 'feedback-message'; // Clase para CSS
        pMensaje.textContent = mensaje;
        pMensaje.style.color = ''; // Resetear color
        if (tipo === 'success') {
            pMensaje.style.color = 'green';
        } else if (tipo === 'error') {
            pMensaje.style.color = 'red';
        } else if (tipo === 'info') {
            pMensaje.style.color = 'blue';
        }
        if (!pMensaje.parentElement) {
            mensajeDisplay.appendChild(pMensaje);
        }

        setTimeout(() => {
            if (pMensaje.parentElement) {
                pMensaje.remove(); // El mensaje desaparece después de 5 segundos
            }
        }, 5000);
    }

    // --- Lógica para la Página de Inicio (Estado de la Alarma) ---

    async function actualizarEstadoUI(estado) {
        if (alarmaToggle) alarmaToggle.checked = estado;
        if (estadoAlarmaTexto) {
            estadoAlarmaTexto.textContent = estado ? "Alarma: ACTIVADA" : "Alarma: DESACTIVADA";
            estadoAlarmaTexto.style.color = estado ? "#2196F3" : "#e53935";
        }
    }

    async function getEstadoAlarma() {
        if (window.location.pathname !== '/') return; // Solo ejecutar en la página de inicio

        try {
            const response = await fetch('/api/estado-alarma');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            console.log("Estado de alarma recibido:", data.estado);
            actualizarEstadoUI(data.estado);
        } catch (error) {
            console.error("Error al obtener el estado de la alarma:", error);
            mostrarMensaje(mensajeSistema, "Error al conectar con la alarma. Verifique la conexión del sistema.", 'error');
        }
    }

    async function setEstadoAlarma(nuevoEstado) {
        try {
            const response = await fetch('/api/estado-alarma', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ estado: nuevoEstado })
            });
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.mensaje || `HTTP error! status: ${response.status}`);
            }
            mostrarMensaje(mensajeSistema, data.mensaje, 'success');
            getEstadoAlarma(); // Volver a consultar para asegurar la UI
        } catch (error) {
            console.error("Error al cambiar el estado de la alarma:", error);
            mostrarMensaje(mensajeSistema, "Error al intentar cambiar el estado: " + error.message, 'error');
        }
    }

    // Inicialización de la página de inicio
    if (alarmaToggle) {
        alarmaToggle.addEventListener('change', function() {
            setEstadoAlarma(this.checked);
        });
        getEstadoAlarma();
    }

    // --- Lógica para la Página de Perfil (Usuario y Contactos de Emergencia) ---

    async function cargarDatosUsuario() {
        if (window.location.pathname !== '/perfil' || !formPerfil) return;

        try {
            const response = await fetch('/api/usuario');
            if (response.ok) {
                const data = await response.json();
                document.getElementById('nombre').value = data.nombre || '';
                document.getElementById('apellido').value = data.apellido || '';
                document.getElementById('email').value = data.email || '';
                document.getElementById('telefono').value = data.telefono || '';
            } else if (response.status === 404) {
                console.log("Usuario no configurado aún.");
            } else {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
        } catch (error) {
            console.error("Error al cargar datos del usuario:", error);
            mostrarMensaje(formPerfil, "Error al cargar el perfil.", 'error');
        }
    }

    // Guardar datos del usuario principal
    if (formPerfil) {
        formPerfil.addEventListener('submit', async function(event) {
            event.preventDefault();
            const formData = {
                nombre: document.getElementById('nombre').value,
                apellido: document.getElementById('apellido').value,
                email: document.getElementById('email').value,
                telefono: document.getElementById('telefono').value
            };

            try {
                const response = await fetch('/api/usuario', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(formData)
                });
                const data = await response.json();
                if (response.ok) {
                    mostrarMensaje(formPerfil, data.mensaje, 'success');
                } else {
                    mostrarMensaje(formPerfil, data.mensaje || 'Error al guardar perfil', 'error');
                }
            } catch (error) {
                console.error("Error al guardar datos del usuario:", error);
                mostrarMensaje(formPerfil, "Error de red al guardar perfil.", 'error');
            }
        });
    }

    // Cargar y mostrar contactos de emergencia
    async function cargarContactos() {
        // Ejecutar si estamos en /perfil O si estamos en /configuracion y el select existe
        if ((window.location.pathname !== '/perfil' && window.location.pathname !== '/configuracion') || (!listaContactos && !selectContactoEmergencia)) return;

        try {
            const response = await fetch('/api/contactos');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const contactos = await response.json();

            // Lógica para la página de Perfil
            if (listaContactos) {
                listaContactos.innerHTML = ''; // Limpiar lista
                contactos.forEach(contacto => {
                    const contactCard = document.createElement('div');
                    contactCard.className = 'contact-card';
                    contactCard.innerHTML = `
                        <span>${contacto.nombre} - ${contacto.telefono}</span>
                        <div class="contact-actions">
                            <button class="edit" data-id="${contacto.id}" data-nombre="${contacto.nombre}" data-telefono="${contacto.telefono}">Editar</button>
                            <button class="delete" data-id="${contacto.id}">Eliminar</button>
                        </div>
                    `;
                    listaContactos.appendChild(contactCard);
                });

                listaContactos.querySelectorAll('.edit').forEach(button => {
                    button.addEventListener('click', editarContacto);
                });
                listaContactos.querySelectorAll('.delete').forEach(button => {
                    button.addEventListener('click', eliminarContacto);
                });
            }

            // Lógica para la página de Configuración (poblar el select)
            if (selectContactoEmergencia) {
                const currentSelectedId = selectContactoEmergencia.value; // Guardar la selección actual si existe
                selectContactoEmergencia.innerHTML = '<option value="">-- Seleccione --</option>'; // Opción por defecto
                contactos.forEach(contacto => {
                    const option = document.createElement('option');
                    option.value = contacto.id;
                    option.textContent = contacto.nombre;
                    selectContactoEmergencia.appendChild(option);
                });
                // Restaurar la selección
                if (currentSelectedId) {
                    selectContactoEmergencia.value = currentSelectedId;
                }
                // Después de cargar contactos en el select, cargar la configuración de alarma para preseleccionar
                cargarConfiguracionAlarma();
            }

        } catch (error) {
            console.error("Error al cargar contactos:", error);
            if (listaContactos) mostrarMensaje(listaContactos, "Error al cargar contactos.", 'error');
            if (selectContactoEmergencia) mostrarMensaje(selectContactoEmergencia.parentElement, "Error al cargar contactos para selección.", 'error');
        }
    }

    // Guardar nuevo contacto de emergencia (o actualizar)
    if (formContactoEmergencia) {
        formContactoEmergencia.addEventListener('submit', async function(event) {
            event.preventDefault();
            const contactoId = document.getElementById('contactoId').value; // Campo oculto para el ID
            const nombre = document.getElementById('contactoNombre').value;
            const telefono = document.getElementById('contactoTelefono').value;

            if (nombre && telefono) {
                const method = contactoId ? 'PUT' : 'POST';
                const url = contactoId ? `/api/contactos/${contactoId}` : '/api/contactos';
                try {
                    const response = await fetch(url, {
                        method: method,
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ nombre, telefono })
                    });
                    const data = await response.json();
                    if (response.ok) {
                        mostrarMensaje(formContactoEmergencia, data.mensaje, 'success');
                        document.getElementById('contactoNombre').value = '';
                        document.getElementById('contactoTelefono').value = '';
                        document.getElementById('contactoId').value = ''; // Limpiar ID oculto
                        cargarContactos(); // Recargar la lista de contactos y el select de configuración
                    } else {
                        mostrarMensaje(formContactoEmergencia, data.mensaje || 'Error al guardar contacto', 'error');
                    }
                } catch (error) {
                    console.error("Error al guardar contacto:", error);
                    mostrarMensaje(formContactoEmergencia, "Error de red al guardar contacto.", 'error');
                }
            } else {
                mostrarMensaje(formContactoEmergencia, "Por favor, complete todos los campos para el contacto.", 'error');
            }
        });
    }

    // Función para pre-llenar el formulario de edición (se activa con el botón "Editar")
    function editarContacto(event) {
        const id = event.target.dataset.id;
        const nombre = event.target.dataset.nombre;
        const telefono = event.target.dataset.telefono;

        // Rellenar el formulario de contacto para edición
        document.getElementById('contactoId').value = id; // Guardar el ID en el campo oculto
        document.getElementById('contactoNombre').value = nombre;
        document.getElementById('contactoTelefono').value = telefono;
        mostrarMensaje(formContactoEmergencia, `Editando contacto: ${nombre}. Guarde los cambios.`, 'info');
        formContactoEmergencia.scrollIntoView({ behavior: 'smooth' }); // Desplazar a la vista del formulario
    }

    // Eliminar contacto
    async function eliminarContacto(event) {
        const contactoId = event.target.dataset.id;
        if (confirm('¿Está seguro de que desea eliminar este contacto?')) {
            try {
                const response = await fetch(`/api/contactos/${contactoId}`, {
                    method: 'DELETE'
                });
                const data = await response.json();
                if (response.ok) {
                    mostrarMensaje(listaContactos, data.mensaje, 'success');
                    cargarContactos(); // Recargar la lista de contactos y el select de configuración
                } else {
                    mostrarMensaje(listaContactos, data.mensaje || 'Error al eliminar contacto', 'error');
                }
            } catch (error) {
                console.error("Error al eliminar contacto:", error);
                mostrarMensaje(listaContactos, "Error de red al eliminar contacto.", 'error');
            }
        }
    }

    // Inicialización de la página de perfil
    if (window.location.pathname === '/perfil') {
        cargarDatosUsuario();
        cargarContactos(); // Cargar contactos al cargar la página de perfil
    }

    // --- Lógica para la Página de Configuración de Alarma ---

    async function cargarConfiguracionAlarma() {
        if (window.location.pathname !== '/configuracion' || !formConfiguracion) return;

        try {
            const response = await fetch('/api/configuracion-alarma');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            document.getElementById('mensajePersonalizado').value = data.mensaje_personalizado || '';
            document.getElementById('notificacionMetodo').value = data.metodo_notificacion || 'SMS';

            // Seleccionar el contacto de emergencia si está configurado
            if (data.contacto_emergencia_id && selectContactoEmergencia) {
                selectContactoEmergencia.value = data.contacto_emergencia_id;
            }

        } catch (error) {
            console.error("Error al cargar configuración de alarma:", error);
            mostrarMensaje(formConfiguracion, "Error al cargar la configuración.", 'error');
        }
    }

    // Guardar la configuración de la alarma
    if (formConfiguracion) {
        formConfiguracion.addEventListener('submit', async function(event) {
            event.preventDefault();
            const formData = {
                mensaje_personalizado: document.getElementById('mensajePersonalizado').value,
                metodo_notificacion: document.getElementById('notificacionMetodo').value,
                contacto_emergencia_id: selectContactoEmergencia.value || null // Puede ser nulo o ID
            };

            try {
                const response = await fetch('/api/configuracion-alarma', {
                    method: 'POST', // O PUT, si lo manejas en el backend
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(formData)
                });
                const data = await response.json();
                if (response.ok) {
                    mostrarMensaje(formConfiguracion, data.mensaje, 'success');
                } else {
                    mostrarMensaje(formConfiguracion, data.mensaje || 'Error al guardar configuración', 'error');
                }
            } catch (error) {
                console.error("Error al guardar configuración de alarma:", error);
                mostrarMensaje(formConfiguracion, "Error de red al guardar configuración.", 'error');
            }
        });

        // La carga de la configuración para la página de configuración ahora es gestionada:
        // Si el selectContactoEmergencia existe (estamos en la página de configuración),
        // `cargarContactos()` se encarga de rellenarlo Y luego llama a `cargarConfiguracionAlarma()`.
        // Si no estamos en la página de configuración (no hay selectContactoEmergencia),
        // cargarConfiguracionAlarma() no se llamaría desde aquí.
        // Pero la llamada explícita a `cargarConfiguracionAlarma()` se hace dentro del if (formConfiguracion)
        // en el `DOMContentLoaded` general, que es correcto.
        if (window.location.pathname === '/configuracion') {
            cargarContactos(); // Cargamos contactos primero para poblar el select, y luego la config
        }
    }
}); // Fin de DOMContentLoaded