# APUNTES DE LOS SPRINTS DEL TRABAJO:

## SPRINT 2:
### Tiempo real / Diferido:
Se planteó la duda de si sería mejor realizar el análisis de emociones en tiempo real (ya sea en un vídeo, utilizando la webcam…) o en diferido. Aunque ambas opciones tienen sus ventajas y sus posibles utilidades, se decide que el análisis sea en tiempo real, ya que es más impactante y se le ve más posible utilidad real.

### OpenCV / YOLO:
En la reunión del comienzo de sprint se comentó que OpenCV no había dado muy buenos resultados en las pruebas, pero que posiblemente era porque tenía los parámetros mal configurados. Por ello, antes de realizar las tareas asignadas para este sprint se comprobó que esta era la razón: al ajustar los parámetros se obtuvieron resultados mejores, donde el movimiento y las sombras no afectaban tanto y seguía detectando la cara, aunque a costa de detectar más falsos rostros durante el vídeo.
Tras realizar las pruebas con YOLO y con OpenCV, se sigue con la opción de YOLO, ya que como se va a utilizar el CESGA no va a haber problemas con la capacidad de cómputo y el funcionamiento observado es mejor.

### Completar el Software Configuration Management:
-	Control de versiones (Git): se va a utilizar GitLab. Para subir el código se utilizarán diferentes ramas, y en main simplemente se subirá el código funcional. Además, aquí se incluye la gestión de tareas, haciendo uso del apartado “Issues” de GitLab.
-	Gestión de entornos: el lenguaje a utilizar será Python 3.13, se utilizarán entornos virtuales por varios motivos, entre ellos facilitar la portabilidad al CESGA. Necesidad de crear e ir actualizando constantemente el archivo “requirements.txt”.

### Estructura del repositorio:
Novedad en este sprint. La idea es juntar los archivos y recursos por carpetas de manera que quede todo bien estructurado. Inicialmente, los posibles apartados podrían ser:
-	/src: archivos del backend, todo lo encargado de realizar el servicio de procesamiento y de base de datos. Aquí iría también el “requirements.txt”.
-	/modelos: archivos pesados de los diferentes modelos (tanto de YOLO como de detección de emociones).
-	/frontend: todo lo relacionado con el cliente (HTML, CSS, JS, etcétera)
-	/documentación: archivos de documentación, como puede ser este mismo documento.

### Evaluación de servidores para procesar backend
Tras preguntar si sería posible utilizar los recursos que ofrece la USC, me comentaron que podía hacer uso del CESGA, lo cual proporciona potencia suficiente como para procesar el backend de esta aplicación. 
Hay que tener en cuenta que se trata de un entorno de supercomputación (HPC), que funciona mediante una terminal remota (SSH) y gestores de colas. Será necesario utilizar un túnel (VPN) y contenedores para cargar el entorno de ejecución. Mi servidor FastAPI estará corriendo dentro del CESGA, pero el túnel será necesario para que el cliente (mi portátil o el dispositivo que utilice) pueda ver la dirección IP y el puerto del servidor.
Además de proporcionar una gran ventaja en cuanto a capacidad de cómputo y latencia, el uso del CESGA aporta valor al proyecto, ya que se está desplegando parte de la aplicación en un entorno distribuido, no solamente usando el localhost. 

### Evaluación de la arquitectura de la aplicación:
Las dos opciones barajadas son Cliente/Servidor puro y Cliente/Servidor con microservicios. Aunque ambas se fundamentan en lo mismo (separar el cliente-frontend del servidor-backend), la forma en la que se organiza el servidor es muy diferente.
Pese a que tiene una mayor complejidad, tras analizar las opciones se eligió el Cliente/Servidor con microservicios por motivos como:
-	Al ser una arquitectura más compleja, se obtiene un trabajo de mayor calidad.
-	Al utilizar el CESGA, se van a poder dividir los diferentes servicios de manera eficiente y es muy difícil que haya latencia al ser un supercomputador.
-	Posibilidad de actualizar los diferentes microservicios por separado.
-	Mayor facilidad para el Fine-Tuning.

### Estructura del proyecto y migración del POC actual:
Como se comentaba anteriormente, la estructura del proyecto debe actualizarse según la arquitectura elegida. Por ello, en este sprint se pasa a estructurar de manera correcta el proyecto (además de su incorporación al repositorio), en lugar de la situación de pruebas utilizada en el sprint anterior.
