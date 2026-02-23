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
-	/src: archivos del backend, todo lo encargado de realizar el servicio de procesamiento y de base de datos.
-	/modelos: archivos pesados de los diferentes modelos (tanto de YOLO como de detección de emociones).
-	/frontend: todo lo relacionado con el cliente (HTML, CSS, JS, etcétera)
-	/documentacion: archivos de documentación, como puede ser este mismo documento.

Esta es la idea inicial, pero unos apartados más adelante decidiremos cual será la estructura para comenzar el proyecto.

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
Para comenzar, se crea la carpeta en local con la estructura deseada. Tras añadir archivos en todas las carpetas para poder visualizar correctamente la estructura en el GitLab, se crea la rama Main y se suben.
También se crea y activa un entorno virtual (envTFG) para garantizar la portabilidad de las librerías al servidor del CESGA, entre otras cosas. 
Se implementa el archivo .gitignore para evitar la subida de ciertos archivos al hacer los push (binarios, temporales o muy pesados).
Las carpetas en las que se estructura inicialmente el proyecto son:
- backend: parte del servidor
- frontend: parte del cliente
- modelos: para almacenar los diferentes modelos
- docs: documentación en formato Markdown
- tests: para realizar pruebas posteriormente

Además, se instalaron las librerías necesarias y se creó el archivo requirements.txt para asegurar que el despliegue posterior sea idéntico al desarrollo local.


### Códigos de prueba
La siguiente parte consistió en experimentar con diferentes prototipos para verificar que la comunicación entre los distintos módulos de la arquitectura funcionaba correctamente. El objetivo de esta fase es puramente experimental: validar el flujo de datos y asegurar un funcionamiento mínimo funcional antes de escalar el sistema y comenzar con las funcionalidades importantes.
En concreto, se han desarrollado los siguientes componentes experimentales:
- Front-end: se han diseñado dos interfaces básicas para probar las dos vías de entradas de datos previstas:
  - Análisis de vídeo (Página de inicio): permite la carga de archivos locales para verificar la capacidad del sistema de procesar frames de vídeo de forma secuencial. Incluye una tabla dinámica que muestra la emoción predominante y un sistema de tracking visual básico mediante la asignación de IDs (Cara 1, Cara 2...) para asegurar que el sistema mantiene la persistencia de los sujetos detectados.
  - Webcam (Página secundaria): dedicada a la captura de emociones en directo con la cámara. Esta funcionalidad está prevista para un futuro.
- Back-end: para dar soporte a las interfaces, se implementó un servidor ligero utilizando FastAPI con las siguientes tareas:
  - Transformación de cadenas Base64 provenientes del navegador a matrices procesables por OpenCV.
  - Integración de YOLO y del modelo de clasificación de emociones. Se priorizó la estabilidad sobre la velocidad, ya que por el momento se sigue operando con la CPU del portátil.
- Por el momento, se consiguió conectar el front-end con el back-end, haciendo pequeñas pruebas con vídeos. Posteriormente, la interfaz tendrá que ser mejorada, proporcionando un aspecto más atractivo e integrando todas las funcionalidades. Además, se separarán las partes de CSS y HTML, que por el momento están juntas.

### Uso del CESGA:
En esta parte, el objetivo va a ser pasar las partes del back-end y de los modelos de IA a los nodos del CESGA, en lugar de ejecutarlas en la CPU de mi portátil.
Tras validar la arquitectura en local, el siguiente objetivo, probablemente realizado en el siguiente sprint, sería migrar el núcleo de computación al supercomputador para eliminar el cuello de botella de mi CPU local.
En esta parte se pretende aprovechar la aceleración por hardware para procesar los vídeos con latencia mínima.