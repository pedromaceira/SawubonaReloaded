========================================================================
  SAWUBONA RELOADED  -  Ejecutable de escritorio (Windows)
========================================================================

Esta carpeta (/dist) es donde se genera el ejecutable de escritorio de
la aplicacion (SawubonaServer).

El ejecutable completo NO se incluye directamente en el arbol de este
repositorio Git por su tamano (~650 MB comprimido, varios GB una vez
descomprimido) y por el elevado numero de archivos que contiene. Meter
binarios tan pesados en Git no es una buena practica y ademas supera los
limites de subida del repositorio.

Por ese motivo, el ejecutable se distribuye como un unico paquete
comprimido descargable, tal y como es habitual para los artefactos ya
compilados.


------------------------------------------------------------------------
  DESCARGA DEL EJECUTABLE
------------------------------------------------------------------------

Descarga el paquete "SawubonaServer_instalador.zip" desde el siguiente
enlace:

    ENLACE (OneDrive):
    https://nubeusc-my.sharepoint.com/:f:/g/personal/pedro_maceira_garcia_rai_usc_es/IgDvcsEL_CPMQI4lBSCYy_OOAfzYGqzWrnMkDsPG4RNMVzw?e=qXddCN

(Tambien disponible en la seccion "Releases" de este proyecto en GitLab.)


------------------------------------------------------------------------
  COMO EJECUTARLO
------------------------------------------------------------------------

1. Descarga el archivo SawubonaServer_instalador.zip desde el enlace
   anterior.

2. Descomprimelo. Obtendras la carpeta SawubonaServer/.

3. IMPORTANTE: el ejecutable SawubonaServer.exe debe permanecer SIEMPRE
   junto a los archivos de su carpeta (en especial la carpeta _internal,
   que contiene los modelos y los recursos que necesita). No muevas ni
   copies el .exe fuera de su carpeta por separado, o no arrancara.

4. Haz doble clic sobre SawubonaServer.exe.

5. Al iniciarse, el programa arranca el servidor local y, tras unos
   segundos, abre automaticamente la interfaz en Google Chrome. No es
   necesario abrir el navegador manualmente.


------------------------------------------------------------------------
  REQUISITOS
------------------------------------------------------------------------

- Windows 10 u 11.
- Google Chrome instalado.
- Conexion a internet en la PRIMERA ejecucion: se descargan unos 110 MB
  de los pesos del modelo FaceNet, que quedan almacenados en cache para
  los usos siguientes (a partir de entonces funciona sin conexion).

========================================================================