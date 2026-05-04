**wanomi**

Informe técnico de especialistas

**Arquitectura de instalación en site de telecomunicaciones**

*Respuesta a: ¿Cómo se instala cada sensor en el site? ¿Cómo se
comunican con el hub?*

Buenos Aires, Argentina \| 2026 \| Confidencial

**0. Respuesta directa a las preguntas planteadas**

La documentación de fabricación anterior mostraba la configuración de
**banco de laboratorio**: todos los módulos sobre una sola protoboard
para facilitar el armado y la verificación sin ir al campo. **En un site
real, esa lógica cambia completamente.** Este informe explica la
topología de instalación que cada especialista del equipo recomienda.

**0.1 Pregunta 1: ¿Un controlador por sensor o por kit?**

Un **controlador por kit**, no por sensor. Cada ESP32-S3 agrupa
múltiples sensores del mismo kit. En el site hay:

-   WN-SITE-SEC: 1 ESP32-S3 que recibe reed switches, PIR, magnetómetro,
    optoacoplador y tags BLE.

-   WN-SITE-GEN: 1 ESP32-S3 que recibe DS18B20, JSN-SR04T, CT clamp,
    MPU-6050, reed y MODBUS.

-   WN-H1-TELCO: 1 Orange Pi Zero 3 corriendo el hub. Recibe datos de
    ambos controladores por Ethernet.

-   EXCEPCIÓN: el acelerómetro del cerco perimetral (ADXL345) requiere
    un sub-nodo ESP32 inalámbrico independiente (WN-FENCE), ya que el
    cerco está a 10-50 m del shelter.

**0.2 Pregunta 2: ¿La comunicación es inalámbrica o cableada?**

Depende del tramo:

  ----------------------------------------------------------------------------------------------
  **Tramo**          **Medio**         **Protocolo**        **Distancia   **Motivo de la
                                                            típica**      elección**
  ------------------ ----------------- -------------------- ------------- ----------------------
  Sensor →           **CABLE**         I²C / 1-Wire / UART  1-15 m        Confiabilidad total,
  controlador del                      / contacto                         sin batería, sin RF en
  kit                                                                     zona de RRU

  ADXL345 cerco →    **CABLE CORTO**   I²C directo          0,5 m (sensor El nodo va pegado al
  sub-nodo WN-FENCE                                         al nodo)      poste del cerco

  WN-FENCE sub-nodo  **INALÁMBRICO**   ESP-NOW (2,4 GHz)    10-200 m LOS  Imposible cablear el
  → WN-SITE-SEC                                                           cerco completo

  Tags iBeacon       **INALÁMBRICO**   BLE 5.0 scan pasivo  0-20 m        Tags adhesivos sin
  baterías →                                                              instalación, CR2032 2+
  WN-SITE-SEC                                                             años

  RS485 DSE/ComAp →  **CABLE**         MODBUS RTU RS485     5-15 m        Bus existente en el
  WN-SITE-GEN                                                             gabinete del grupo

  WN-SITE-SEC →      **CABLE**         Ethernet Cat6 /      5-30 m        Dentro del shelter,
  WN-H1-TELCO hub                      MQTT-TLS                           bajo vacío EMI

  WN-SITE-GEN →      **CABLE**         Ethernet Cat6 /      5-30 m        Puede recorrer la
  WN-H1-TELCO hub                      MQTT-TLS                           canaleta existente

  WN-H1-TELCO → NOC  **CABLE/RF**      Backhaul del site    Backhaul del  Usa el transporte ya
  Claro                                (fibra/microondas)   site          instalado

  Failover hub → NOC **INALÁMBRICO**   LTE-M / SIM M2M      Nacional      Solo si cae el
                                       Claro                              backhaul primario
  ----------------------------------------------------------------------------------------------

> **⚠ La comunicación inalámbrica se limita a dos casos muy específicos:
> el cerco perimetral (ESP-NOW) y los tags de baterías (BLE). Todo lo
> demás es cable.**

**1. Diagrama de arquitectura de site**

El siguiente diagrama muestra la topología completa de instalación con
todos los sensores, controladores, hub y NOC en sus posiciones físicas
reales.

![](media/bad9d1f2a9694349d46adf42a904e5e5e6796808.png){width="6.692913385826771in"
height="5.708661417322834in"}

**2. Informe --- Especialista Integración OSS/BSS: SNMP · REST · Syslog
al NOC**

**2.1 Flujo completo de un evento desde el sensor hasta el NOC**

El camino de un evento de alarma tiene 5 etapas bien definidas. Ninguna
depende de conectividad a internet externo hasta la etapa 5:

  -----------------------------------------------------------------------------
  **Etapa**   **Componente**        **Qué pasa**                   **Latencia
                                                                   típica**
  ----------- --------------------- ------------------------------ ------------
  1           Sensor físico (reed,  Dispara interrupción o supera  \< 50 ms
              PIR, etc.)            umbral                         

  2           ESP32-S3 (WN-SITE-SEC Detecta el evento, genera      \< 500 ms
              o GEN)                payload JSON firmado, publica  
                                    por MQTT/TLS al hub            

  3           WN-H1-TELCO hub (EMQX Recibe MQTT, evalúa reglas de  \< 1 s
              local)                alarma, persiste en MongoDB,   
                                    genera ForensicEvent           

  4           Bridge NOC (node.js / Enriquece el evento (siteCode, \< 2 s
              wanomi)               lat/lng, severity), despacha   
                                    por SNMP trap y/o syslog y/o   
                                    webhook REST                   

  5           NetCool / OSS de      Recibe el trap SNMP o el       \< 5 s total
              Claro                 evento REST, genera ticket,    
                                    alerta al operador             
  -----------------------------------------------------------------------------

> **ℹ** *El hub Wanomi bufferiza eventos en MongoDB si el NOC está
> momentáneamente inaccesible. Cuando se restaura la conectividad,
> reenvía en orden con backoff exponencial. No se pierde ningún evento.*

**2.2 Protocolo SNMP --- Integración con NetCool**

El hub Wanomi genera traps SNMPv3 desde el módulo noc_bridge.js. El MIB
privado wanomi-telecom-mib.txt se compila en NetCool / HP OpenView /
Zabbix antes del go-live del piloto. Cada trap incluye:

-   OID raíz: 1.3.6.1.4.1.{PEN}.1.{trap_code} --- PEN a solicitar a IANA
    (gratis, \~1 semana).

-   Variables vinculadas: siteId, deviceId, timestamp RFC 3339, severity
    (CRITICAL/HIGH/MEDIUM), eventKind, sensorValue, forensicHash.

-   Autenticación: SNMPv3 authPriv con SHA-256 + AES-128. Credenciales
    configuradas por site en la UI del hub.

  --------------------------------------------------------------------------------
  **Trap OID         **Descripción**                   **Severity**   **Código**
  relativo**                                                          
  ------------------ --------------------------------- -------------- ------------
  1.1.10             Puerta forzada + vibración        CRITICAL       2001
                     simultánea                                       

  1.1.11             Vibración anómala en cerco        HIGH           2002
                     perimetral                                       

  1.1.12             Pérdida de continuidad de tierra  CRITICAL       2003

  1.1.13             Tag BLE de batería desaparecido   CRITICAL       2004
                     (batería robada)                                 

  1.1.14             Presencia interior con puerta     HIGH           2005
                     cerrada (anomalía)                               

  1.1.20             Combustible bajo (\< 25%)         MEDIUM         2010

  1.1.21             Caída brusca de nivel → sifoneo   CRITICAL       2011
                     probable                                         

  1.1.22             Arranque fallido del grupo        CRITICAL       2012
                     electrógeno                                      

  1.1.23             Sobretemperatura motor (\> 95°C)  HIGH           2013

  1.1.24             Vibración motor anómala vs.       MEDIUM         2014
                     baseline aprendida                               

  1.1.25             Batería de arranque degradada (\< MEDIUM         2015
                     12.4 V)                                          
  --------------------------------------------------------------------------------

**2.3 Protocolo Syslog RFC 5424 con TLS**

Canal alternativo o complementario al SNMP. Útil si el NOC usa un SIEM
(Splunk, Graylog, ELK) que acepta syslog directamente:

-   Facility 18 (local2), Severity según tabla de severidades Wanomi →
    syslog.

-   Structured data: key=value pairs con siteId, deviceId, forensicId,
    hash.

-   TLS 1.2 mínimo con certificado cliente del hub (self-signed CA
    Wanomi, renovación anual).

-   Puerto destino: 6514 (syslog sobre TLS) en el servidor de logs del
    NOC.

**2.4 Webhook REST / JSON**

Para NOCs modernos con API gateway o bus de eventos. El payload incluye
la cadena forense completa (hash + prevHash + HMAC) lo que permite
validar la cadena de custodia desde el sistema externo sin depender del
hub Wanomi:

-   POST a endpoint configurable por site. Autenticación: Bearer token +
    mTLS opcional.

-   Reintentos automáticos con cola persistente en MongoDB: 3 intentos
    cada 30 s, luego 5 min, luego 1 h.

-   Campo media\[\] con URLs a snapshots de cámara si el site tiene
    WN-CAM (roadmap).

**2.5 Configuración necesaria de parte de Claro (entregables de la Fase
0)**

-   Confirmar qué protocolo(s) acepta el NOC (SNMP v3 / syslog TLS /
    REST). El hub emite cualquiera o todos en paralelo.

-   Proveer IP/hostname del servidor SNMP trap receiver, el community
    string / credenciales v3.

-   Compilar wanomi-telecom-mib.txt en el NMS (NetCool / Zabbix). Wanomi
    provee el archivo MIB.

-   Habilitar en el firewall del NOC el puerto 162/UDP (SNMP) o 6514/TCP
    (syslog TLS) desde la IP del hub WN-H1-TELCO de cada site.

-   Asignar IPs fijas (o FQDN interno) a los hubs en la VLAN de O&M.

**3. Informe --- Ing. Electrónico Industrial: Diseño PCB · Enclosure ·
BOM · Ensamble**

**3.1 Topología física definitiva: 3 cajas, no 1**

En el site real hay tres enclosures físicamente separados, conectados
entre sí por cables:

  ------------------------------------------------------------------------------------
  **Enclosure**   **Contenido**                   **Ubicación       **Alimentación**
                                                  física**          
  --------------- ------------------------------- ----------------- ------------------
  WN-SITE-SEC     ESP32-S3 + módulos I²C + PIR +  Interior del      -48 VDC via Mean
                  optoacoplador + antena LTE-M    shelter,          Well SD-15B-5
                                                  atornillado a la  
                                                  pared o al rack,  
                                                  accesible         

  WN-SITE-GEN     ESP32-S3 + MAX485 + módulos     Junto al gabinete -48 VDC o 12 VDC
                  I²C + bornera 6× PG7 para       del grupo         de la batería del
                  cables al GE                    electrógeno       GE
                                                  (exterior         
                                                  protegido o       
                                                  interior GE)      

  WN-H1-TELCO     Orange Pi Zero 3 + Docker +     Interior del      -48 VDC via Mean
                  switch DIN + UPS HAT + Quectel  shelter, rail     Well SD-25B-5
                  LTE-M                           DIN, adyacente al 
                                                  rectificador      

  WN-FENCE        ESP32 mini + ADXL345 + LiPo +   Exterior,         Solar 1W + LiPo
  (sub-nodo)      solar                           atornillado a un  2000 mAh
                                                  poste del cerco   
                                                  perimetral        
  ------------------------------------------------------------------------------------

**3.2 Cómo se conectan los sensores al controlador (cable por cable)**

La protoboard de laboratorio **nunca sale al campo**. En el site, cada
sensor se conecta con un cable pre-confeccionado al controlador de su
kit. La siguiente tabla detalla cada sensor, su ubicación física en el
site y el cable que lo une al controlador:

  ---------------------------------------------------------------------------------------------------
  **Sensor**      **Kit**    **Ubicación física   **Cable al      **Longitud    **Conector en ctrl.**
                             en site**            controlador**   típica**      
  --------------- ---------- -------------------- --------------- ------------- ---------------------
  Reed switch     SEC        Pegado al marco de   Par 22 AWG en   2-5 m         Terminal block 2
  puerta                     la puerta del        canaleta                      pines
  principal                  shelter (parte fija)                               

  Reed switch     SEC        Marco del gabinete   Par 22 AWG      1-3 m         Terminal block 2
  gabinete rack              de baterías o                                      pines
                             rectificador                                       

  PIR HC-SR501    SEC        Ángulo superior del  Triplete 22 AWG 3-5 m         JST-XH 3 pines
                             shelter apuntando al (VCC/GND/OUT)                 
                             interior                                           

  Optoacoplador   SEC        El loop sigue el     Los 2 extremos  0,5 m (solo   Terminal block 2
  PC817 (loop                cable de tierra      del conductor   el opto)      pines
  tierra)                    existente del site   de tierra pasan               
                                                  por el PC817                  

  QMC5883L        SEC        Fijado a la bandeja  Cable I²C 4     1-3 m         JST-XH 4 pines
  magnetómetro               de cables cerca de   hilos 28 AWG                  (I²C+VCC+GND)
                             la bajada de antena  trenzado                      

  ADXL345 (cerco) WN-FENCE   Atornillado al poste 0,5 m hasta el  N/A ---       Directo en PCB del
                             metálico del cerco   nodo WN-FENCE   inalámbrico   sub-nodo
                             perimetral           (mismo          al SEC        
                                                  enclosure)                    

  Tags iBeacon    SEC        Adhesivo 3M sobre    Sin cable ---   Sin cable     Sin cable
  baterías                   cada batería VRLA en BLE pasivo                    
                             el rack                                            

  MPU-6050        GEN        Atornillado con      Cable I²C       2-3 m         JST-XH 4 pines
  vibración GE               soporte magnético al blindado 4×28                 
                             bloque del motor     AWG                           
                             diesel                                             

  DS18B20         GEN        Manguito termopocket Cable silicona  2-5 m         Terminal block 3
  temperatura                roscado 1/4 NPT en   3 hilos 26 AWG                pines
  refrigerante               línea externa de                                   
                             refrigeración                                      

  JSN-SR04T nivel GEN        Transductor          Cable built-in  3 m fijo      JST-PH 4 pines
  combustible                ultrasónico en tapa  3 m del módulo                (VCC/GND/TRIG/ECHO)
                             del tanque, con      (no modificar)                
                             junta neopreno                                     

  SCT-013-030 CT  GEN        Abrazando el cable   Cable 2,5 mm    1-2 m         Jack 3,5 mm / ADC
  clamp                      del motor de         jack a divisor                
                             arranque (dentro     burden                        
                             gabinete GE)                                       

  Reed switch     GEN        Marco de la tapa de  Par 22 AWG      2-5 m         Terminal block 2
  tapa tanque                inspección del                                     pines
                             tanque                                             

  RS485 MODBUS    GEN        Puerto RS485 del     Par trenzado    5-15 m        Terminal block
  DSE/ComAp → GEN            controlador DSE7320  blindado 2×24                 A/B/GND
                             en gabinete GE       AWG con DB9                   
  ---------------------------------------------------------------------------------------------------

**3.3 Especificación de cables para instalación**

-   I²C a distancia (MPU-6050, QMC5883L, ADXL345): cable multipar 28 AWG
    con pantalla global drenada. Máximo 3 m sin repetidor. Si se
    necesita más, usar buffer I²C PCA9517 o convertir a SPI.

-   1-Wire DS18B20: cable apantallado 3 hilos 26 AWG silicona. Hasta 20
    m sin repetidor con pullup 2.2 kΩ activo.

-   Contactos secos (reed switches): par sin pantalla 22 AWG FRPE
    (retardante llama). No necesita blindaje --- es contacto seco.

-   RS485 MODBUS: par trenzado blindado (impedancia 120 Ω) con
    resistores de terminación 120 Ω en cada extremo del bus.

-   Alimentación -48 VDC: cable rígido 18 AWG mínimo para corrientes
    hasta 1 A. Cable libre de halógenos (LSZH) en el shelter.

-   Ethernet Cat6: patch prearmado de fábrica. No hacer crimpado en
    campo si es posible.

**4. Informe --- Ing. Potencia DC: Protecciones -48 VDC · EMC · Rayos**

**4.1 Arquitectura de distribución de energía en el site**

El site de telecomunicaciones opera con una barra de -48 VDC (negativa
al chasis, positivo a tierra). Los dispositivos Wanomi se alimentan de
esa barra mediante conversores DC/DC aislados. Nunca se conectan
directamente.

  --------------------------------------------------------------------------------------
  **Dispositivo**   **Conversor**   **Entrada**   **Salida**   **Consumo    **Consumo
                                                               típico**     pico**
  ----------------- --------------- ------------- ------------ ------------ ------------
  WN-SITE-SEC       Mean Well       36-72 VDC (ok 5 VDC / 3 A  \~ 0.8 W     \~ 3.5 W
                    SD-15B-5        para -48V)                 base         (LTE-M TX)

  WN-SITE-GEN       Mean Well       40-75 VDC     5 VDC / 3 A  \~ 0.6 W     \~ 1.5 W
                    SD-15C-5                                   base         (MODBUS
                                                                            activo)

  WN-H1-TELCO       Mean Well       18-75 VDC     5 VDC / 5 A  \~ 4 W base  \~ 8 W
                    SD-25B-5                                   (OPi +       (boot +
                                                               switch)      LTE-M)

  WN-FENCE sub-nodo LiPo + solar 1W Solar 5V 1W   3.3 VDC      \~ 0.1 W     \~ 0.5 W (TX
                                                  interno      promedio     ESP-NOW)
  --------------------------------------------------------------------------------------

> **⚠ CRÍTICO: La barra -48 VDC tiene polaridad invertida respecto a las
> convenciones de electrónica de consumo. El pin negativo es -48 V, el
> pin positivo es tierra del chasis. Verificar polaridad con multímetro
> ANTES de conectar el conversor Mean Well.**

**4.2 Protecciones obligatorias en la entrada de cada dispositivo**

El entorno eléctrico de un site celular es uno de los más hostiles para
la electrónica de baja tensión. Hay transitorios de ray, conmutación de
cargas de rectificador y posibles inversiones de polaridad durante el
mantenimiento. El siguiente esquema de protección es mandatorio en cada
entrada -48 VDC:

  ---------------------------------------------------------------------------------------
  **Protección**   **Componente**   **Especificación**   **Función**       **Ubicación en
                                                                           PCB**
  ---------------- ---------------- -------------------- ----------------- --------------
  Fusible          Polifuse PTC     0.5 A hold, 1 A      Sobrecorriente:   Primera en
                   MF-R050          trip, resetable      protege el        línea (antes
                                                         conversor         de todo)

  Varistor MOV     MOV 14D431K (430 430 V clampeo, 7 kA  Transieno de      En paralelo
                   V)               pulso                tensión (rayo en  con la
                                                         la torre)         entrada,
                                                                           después del
                                                                           fusible

  TVS              SMBJ75A          75 V standoff, 1.5   Transieno rápido  En paralelo,
  bidireccional                     kW pulso             de conmutación    después del
                                                                           MOV

  Ferritas EMI     Ferrita snap-on  25 Ω @ 100 MHz       Ruido conducido   Serie en línea
                   o SMD en línea   mínimo               desde el          de
                                                         rectificador      alimentación y
                                                                           señal

  Diodo de         P-channel MOSFET Protección polaridad Inversión         Gate a
  polaridad        BSS84 o similar  inversa eficiente    accidental        positivo,
                                                         durante           fuente en
                                                         mantenimiento     negativo

  Condensador bulk 100 µF, 100 V,   Electrolítico o      Absorbe           Salida del
                   bajo ESR         tantalio             transitorios del  conversor Mean
                                                         rectificador      Well
  ---------------------------------------------------------------------------------------

**4.3 Consideraciones EMC para sites con RRU 5G**

Los sites 5G NR con RRU en torre (banda 3.5 GHz, EIRP \> 50 dBm) generan
campo electromagnético significativo en el shelter cuando el cableado de
antena pasa adyacente. Recomendaciones:

-   Mantener los cables de señal (I²C, RS485) en canaleta metálica
    separada del cableado RF. Distancia mínima: 30 cm de los cables
    coaxiales RRU.

-   Blindar el enclosure WN-SITE-SEC con lámina de aluminio autoadhesiva
    en el interior de la tapa PETG si se detectan interferencias en los
    sensores I²C (se manifiesta como lecturas erróneas o NAK en el bus).

-   Usar cables I²C apantallados (trenzado + pantalla drenada a GND en
    UN solo extremo) para distancias \> 1 m.

-   El MPU-6050 del WN-SITE-GEN en el grupo electrógeno: el motor diesel
    genera chispas de encendido y RF de baja frecuencia. Agregar ferrita
    en el cable I²C dentro del enclosure del controlador.

**4.4 WN-FENCE sub-nodo: presupuesto de energía solar**

El sub-nodo del cerco es el único que no puede alimentarse de -48 VDC
(no hay cable hasta el cerco). Opera con batería + panel solar 1W:

-   Consumo promedio ESP32 mini con ADXL345 en modo deep sleep (1 s) +
    TX ESP-NOW (50 ms): \~0.08 W promedio.

-   Panel solar 1W / 5V en Buenos Aires: genera \~0.8 Wh/día en invierno
    (peor caso).

-   LiPo 2000 mAh / 3.7V = 7.4 Wh. Con 0.08 W de consumo: autonomía sin
    sol = 92 h = 3.8 días.

-   Balance: el panel carga suficiente incluso en días nublados. No se
    necesita batería más grande.

-   Protección del panel: diodo Schottky 1N5817 en serie para evitar
    descarga inversa de noche.

**5. Informe --- Vibración / Mecánica de Fluidos: Sensado GE · FFT ·
Ultrasónico**

**5.1 Instalación del MPU-6050 en el grupo electrógeno**

El MPU-6050 es el sensor más crítico del WN-SITE-GEN y el que más afecta
la calidad del diagnóstico predictivo. Su instalación debe ser
mecánicamente rígida:

**Punto de montaje óptimo**

-   Bloque del motor: cara plana adyacente al cárter de aceite, lejos
    del escape. Temperatura \< 70 °C en superficie.

-   Alternativa: chasis del grupo próximo al motor (marco metálico
    soldado, no chapa). La atenuación es mayor pero aceptable.

-   Evitar: tapa de válvulas, soporte de filtro de aire o cualquier
    parte que vibre en modo de resonancia propio del material.

**Método de fijación**

-   Soporte magnético con base ferrítica (imán N52, retención 80 kg):
    instalar el sensor en el soporte y apoyar sobre el bloque. Verificar
    que no se desplace al iniciar el motor.

-   Alternativa permanente: tornillo M4×10 con pasador de acero + epoxy
    metálico en el bloque (para montajes definitivos en la fase de
    producción).

-   El módulo MPU-6050 se atornilla al soporte con M2.5×6 y arandela de
    nylon. El tornillo de nylon aísla vibración de alta frecuencia del
    enclosure plástico.

**Eje de medición**

El MPU-6050 mide en los 3 ejes. El eje Z perpendicular al bloque captura
la vibración de pistones. El eje X/Y captura desequilibrio rotacional.
En el firmware, se calcula la FFT del eje Z + magnitud vectorial de X+Y
para la firma espectral completa.

**5.2 Aprendizaje de la línea base vibracional**

El sistema no usa umbrales fijos de vibración --- aprende la firma del
grupo particular instalado en ese site:

-   Al presionar el BTN de calibración del WN-SITE-GEN, el firmware
    muestrea 5 arranques + 30 minutos de operación estable.

-   Calcula la FFT promedio de 1024 muestras a 1 kHz = resolución de
    frecuencia de 1 Hz hasta 500 Hz.

-   Identifica los 10 bins de mayor magnitud como la \"firma espectral
    nominal\" y los guarda en NVS.

-   En operación continua, cada 5 minutos compara la FFT actual vs. la
    firma. Si hay desviación \> 30% en 3 o más bins → alarma \"vibración
    anómala\".

-   Tipos de falla detectables: cojinete desgastado (pico espectral a
    frecuencia de la falla del cojinete), desbalanceo del alternador
    (armónicos del orden de rotación), golpeteo de inyectores (ruido de
    banda ancha).

**5.3 Instalación del JSN-SR04T para nivel de combustible**

El sensor ultrasónico JSN-SR04T mide la distancia al nivel del
combustible por reflexión ultrasónica (40 kHz). Su instalación correcta
es fundamental para lecturas precisas:

-   Perforar la tapa del tanque con broca de 22 mm. Insertar el
    transductor y sellar con rosca + junta de PTFE. El transductor mira
    hacia abajo, paralelo a las paredes del tanque.

-   Distancia mínima de medición: 20 cm desde el transductor. Si el
    tanque es pequeño (\< 30 cm de profundidad) se puede usar el HC-SR04
    convencional (distancia mín. 2 cm) aunque sin IP67.

-   Evitar instalar cerca del punto de carga de combustible --- la
    turbulencia al cargar genera lecturas erróneas.

-   Calibración: con el tanque lleno, leer la distancia medida y
    guardarla como \"nivel 100%\". Con el tanque vacío, guardar como
    \"nivel 0%\". La conversión es lineal si el tanque es prismático.

-   Comparar la lectura del JSN-SR04T con la del sensor capacitivo
    interno del DSE (leído por MODBUS). Si difieren \> 10%, el firmware
    genera alerta de \"discrepancia de nivel\".

**5.4 Instalación del SCT-013-030 CT clamp para corriente de arranque**

El CT clamp no invasivo es la forma de medir la corriente del motor de
arranque sin cortar ni empalmar nada:

-   Abrir el núcleo del SCT-013-030, pasar el cable del motor de
    arranque por el interior y cerrar. SOLO pasar UN conductor (el cable
    de fase del motor de arranque, no el neutro). Si pasan dos, las
    corrientes se cancelan y la lectura es cero.

-   Posicionarlo a menos de 30 cm del motor de arranque para reducir el
    efecto capacitivo del cable largo.

-   El circuito burden en el WN-SITE-GEN: resistor 62 Ω + condensador 10
    µF a Vcc/2 para centrar la señal AC en el ADC del ESP32.

-   Interpretación: al arrancar, la corriente de motor de arranque es
    típicamente 200-400 A durante 2-5 s. Una corriente \> 450 A por más
    de 8 s = resistencia mecánica excesiva (motor frío, aceite espeso,
    obstrucción). Una corriente \< 150 A con motor no arrancado =
    batería de arranque débil.

**6. Informe --- Diseñador Industrial: Enclosure · Ergonomía ·
Canalización**

**6.1 Filosofía de instalación en site**

Un dispositivo instalado en un site de telecomunicaciones es parte de la
infraestructura del operador. Debe verse como tal: etiquetado,
documentado, ordenado y alineado con los estándares visuales del
shelter. Un cableado descuidado o un enclosure improvisado genera
rechazo inmediato del equipo de O&M --- independientemente de que
funcione.

El diseño de instalación Wanomi sigue tres principios:

-   IDENTIFICACIÓN: cada cable tiene etiqueta en ambos extremos. Cada
    enclosure tiene placa de identificación con siteCode, número de
    serie, versión de firmware y fecha de instalación.

-   ORDEN: todos los cables van en canaleta o protección de cable.
    Ningún cable queda suelto o cruzando el paso.

-   ACCESO: el técnico de O&M puede desconectar un sensor sin
    herramientas especiales ni cortar cables.

**6.2 Posición y fijación de cada enclosure**

  ------------------------------------------------------------------------------
  **Enclosure**   **Posición en site**     **Método de        **Requisito de
                                           fijación**         acceso**
  --------------- ------------------------ ------------------ ------------------
  WN-H1-TELCO     Rail DIN en el tablero   Clip DIN integrado Frente accesible
  (hub)           del shelter, al lado del en el chasis. 2    siempre. Cables
                  rectificador o en rack   tornillos M4 al    traseros en
                  19\" con adaptador       rack si            canaleta.
                                           corresponde.       

  WN-SITE-SEC     Pared del shelter a      Oreja de montaje   A la vista del
                  1.6-1.8 m de altura,     M4 atornillada a   personal. LED de
                  cerca del rack de        taco Fisher 8 mm   estado visible
                  baterías. Fuera del área en pared de        desde la puerta.
                  de trabajo del técnico   hormigón.          
                  de rectificador.                            

  WN-SITE-GEN     En la pared del shelter  Oreja M4 en pared  Accesible con el
                  interior o en el lateral o tornillo M6      grupo detenido.
                  del gabinete del grupo   directo al chasis  Protegido de
                  electrógeno, según el    del GE.            derrame de
                  layout del site.                            combustible.

  WN-FENCE        Poste del cerco          Abrazadera de      Solo accesible con
  (sub-nodo)      perimetral, a 1.8-2 m de acero inox de 2    escalera.
                  altura. Orientación:     puntos. Sin        Reemplazo de
                  panel solar hacia el     taladrar el poste. batería 1 vez/año.
                  norte.                                      
  ------------------------------------------------------------------------------

**6.3 Canalización y ruteo de cables**

Esquema de canalización por zonas del site:

-   Zona shelter interior: canaleta PVC 20×12 mm blanca o gris adherida
    con cinta doble faz 3M VHB 5952 sobre pared. Los cables de señal van
    en canaleta separada de los cables de potencia (220 VAC / -48 VDC).

-   Pasatapas entre el shelter y el exterior: prensacable PG16 en la
    pared del shelter (si ya existe un pasa-muro metálico para el
    cableado de antenas, usar el mismo con goma de sellado).

-   Zona exterior (entre shelter y GE): tubo conduit EMT 3/4\" con
    extremos sellados con silicona neutra. El conduit se fija a la pared
    con grapas cada 60 cm. Pendiente mínima: 2% hacia afuera para
    drenaje.

-   Zona cerco perimetral: ningún cable sale al cerco. El sub-nodo
    WN-FENCE es autónomo. Si hubiera necesidad de cablear (sitio sin
    cobertura ESP-NOW), usar cable CAT6 outdoor con UV protection en
    conduit.

**6.4 Etiquetado estándar**

Cada cable lleva una etiqueta de cable termocontraíble en ambos extremos
con el siguiente formato:

> **WANOMI-\[SITECODE\]-\[DISPOSITIVO\]-\[FUNCIÓN\]-\[DESDE\]-\[HASTA\]**

Ejemplo: WANOMI-BA0123-SEC-REED1-PUERTA-GPIO4

-   Usar etiquetadora termocontraíble (P-Touch PT-E550W o similar) o
    impresión en papel plastificado termocontraíble.

-   Cada enclosure lleva placa adhesiva exterior con: wanomi +
    siteCode + N° de serie + FW version + fecha.

-   Reed switches y sensores externos: etiqueta en el cuerpo del sensor
    con el punto de instalación (\"PUERTA PRINCIPAL\", \"TAPA TANQUE\")
    y el código de cable.

**6.5 Dimensiones de los cables pre-confeccionados --- referencia de
pedido**

Para el piloto, los cables se confeccionan en taller y se van al site
pre-cortados y etiquetados. Las longitudes son máximas (sobra es mejor
que corto):

  -----------------------------------------------------------------------------------------------
  **Cable**      **Tipo**      **Largo**   **Extremo A      **Extremo B       **Referencia**
                                           (sensor)**       (controlador)**   
  -------------- ------------- ----------- ---------------- ----------------- -------------------
  Reed switch    Par 22 AWG    5 m         Terminales       Terminal block 2  SEC-REED-PUERTA
  puerta         LSZH                      volantes pelados pines             
                                           15 mm                              

  Reed switch    Par 22 AWG    3 m         Terminales       Terminal block 2  SEC-REED-GABINETE
  gabinete       LSZH                      volantes         pines             

  PIR HC-SR501   Triplete 22   5 m         JST-XH 3 pines   JST-XH 3 pines    SEC-PIR
                 AWG LSZH                  macho            hembra (en PCB)   

  QMC5883L I²C   Multiplex 28  3 m         JST-XH 4 pines   JST-XH 4 pines    SEC-QMC-I2C
                 AWG                       macho            hembra (en PCB)   
                 apantallado                                                  

  Tags BLE       Sin cable     N/A         Adhesivo CR2032  BLE pasivo        BLE-TAG-Bx

  MPU-6050 I²C   Multiplex 28  3 m         JST-XH 4 pines   JST-XH 4 pines    GEN-MPU-I2C
                 AWG blindado              macho            hembra            

  DS18B20 temp.  Silicona 3    5 m         Conector DIN     Terminal block 3  GEN-DS18-TEMP
                 hilos 26 AWG              IP67 3 pines     pines             

  JSN-SR04T      Cable         3 m         Transductor IP67 JST-PH 4 pines en GEN-ULTRAS-NIVEL
  nivel          built-in del                               módulo            
                 módulo                                                       

  CT clamp       Cable del     2 m         Jack 3,5 mm del  Borne burden (2   GEN-CT-ARRANQUE
  SCT-013        clamp + ext.              CT               pines)            

  Reed tapa      Par 22 AWG    5 m         Terminales       Terminal block 2  GEN-REED-TAPA
  tanque         LSZH                      volantes         pines             

  RS485 al       Par trenzado  15 m        DB9 hembra (pin  Terminal block    GEN-RS485-DSE
  DSE/ComAp      blindado 24               3=A, 5=GND, 7=B) A/B/GND           
                 AWG                                                          

  Ethernet SEC → Cat6 RJ45     15 m        RJ45 macho       Puerto del switch ETH-SEC-HUB
  Hub                                      crimpado         DIN               

  Ethernet GEN → Cat6 RJ45     30 m        RJ45 macho       Puerto del switch ETH-GEN-HUB
  Hub            outdoor                                    DIN               

  Alimentación   LSZH 18 AWG   2 m         Terminales       Entrada Mean Well PWR-SEC-48V
  SEC            rojo/negro                horquilla M4     SD-15B-5          

  Alimentación   LSZH 18 AWG   2 m         Terminales       Entrada Mean Well PWR-GEN-48V
  GEN            rojo/negro                horquilla M4     SD-15C-5          

  Alimentación   LSZH 18 AWG   2 m         Terminales       Entrada Mean Well PWR-HUB-48V
  Hub            rojo/negro                horquilla M4     SD-25B-5          
  -----------------------------------------------------------------------------------------------

**7. Conclusiones y decisiones de diseño consolidadas**

Los cinco especialistas concuerdan en las siguientes decisiones de
arquitectura para el piloto:

  -------------------------------------------------------------------------------
  **Decisión**   **Descripción**
  -------------- ----------------------------------------------------------------
  **DEC-01**     Un ESP32-S3 por kit, no por sensor. SEC tiene 1 controlador, GEN
                 tiene 1 controlador, Hub tiene 1 OPi Zero 3.

  **DEC-02**     La comunicación sensor → controlador es CABLEADA para todos los
                 sensores a distancia menor a 15 m del controlador.

  **DEC-03**     La ÚNICA excepción inalámbrica activa es el sub-nodo WN-FENCE en
                 el cerco perimetral, usando ESP-NOW (2.4 GHz, 100-200 m). No
                 requiere router ni AP intermedio.

  **DEC-04**     Los tags iBeacon en las baterías VRLA son inalámbricos pasivos
                 (BLE 5.0 scan). Sin batería dedicada de instalación --- CR2032
                 dura 2+ años.

  **DEC-05**     La comunicación controlador → hub es ETHERNET Cat6 con MQTT
                 sobre TLS 1.2. Dentro del shelter: 5-15 m. GEN al hub: hasta 30
                 m en conduit exterior.

  **DEC-06**     La comunicación hub → NOC usa el BACKHAUL existente del site
                 (fibra/microondas). El LTE-M con SIM M2M Claro es FAILOVER, no
                 canal primario.

  **DEC-07**     La protección de entrada -48 VDC es OBLIGATORIA: fusible
                 polifuse + MOV + TVS + ferrita + diodo de polaridad en cada
                 dispositivo.

  **DEC-08**     El MPU-6050 se calibra in-situ con la firma real del grupo
                 instalado. No se usan umbrales fijos. La calibración se hace con
                 el BTN físico del enclosure.

  **DEC-09**     Todos los cables van en canaleta. Todos los cables llevan
                 etiqueta en ambos extremos. El etiquetado es parte de la
                 instalación, no opcional.

  **DEC-10**     La protoboard del documento de fabricación es EXCLUSIVAMENTE
                 para banco de laboratorio y verificación. En field, el hardware
                 va en PCB custom (producción) o en módulos con cables
                 confeccionados (piloto).
  -------------------------------------------------------------------------------
