# Catálogo de modelos gratuitos para corridas (17/11/2026)

Todos com licença **CC0** (uso livre, inclusive comercial, sem crédito obrigatório). Downloads brutos em
`downloads/` (fora do Git). Conferido na página de cada fonte.

## Pistas e cenário
| Pacote | Fonte | Formato | Conteúdo útil |
|---|---|---|---|
| **Kenney Racing Kit 1.2** | https://opengameart.org/content/racing-kit · https://kenney.nl/assets/racing-kit | GLB/FBX/OBJ (71) | `roadStart`, `roadStartPositions`, `roadStraight(Long)`, curvas, rampas, ponte, `grandStand(Covered)` (arquibancada), `flagCheckers`, `overheadLights` (pórtico da largada), boxes (`pitsGarage`), tendas, barreiras, cercas, postes de luz, outdoor, árvores, grama |
| **Kenney Toy Car Kit** | https://opengameart.org/content/toy-car-kit | GLB/FBX/OBJ (106) | pista de brinquedo estreita/larga com curvas, rampas, loops, portal de chegada (`gate-finish`), itens (moedas, caixas) |
| **Fertile Soil – Modular Racetrack** | https://opengameart.org/content/modular-racetrack-3d-models | OBJ (20) | retas, curvas, rampas, salto, **loop**, áreas de escape |
| ~~Kenney Racing Pack~~ | https://opengameart.org/content/racing-pack | 2D (sprites) | descartado: é visão de cima 2D |

## Carros e veículos
| Pacote | Fonte | Formato | Modelos |
|---|---|---|---|
| **Kenney Car Kit 3.1** | https://opengameart.org/content/car-kit | GLB/FBX/OBJ | sedan, sedan-sports, hatchback-sports, **race**, **race-future**, suv, suv-luxury, taxi, police, ambulance, firetruck, garbage-truck, truck, truck-flat, van, delivery, tractor, tractor-police, tractor-shovel, **5 karts** (kart-oobi/oodi/ooli/oopi/oozi) |
| **Quaternius LowPoly Car Pack** | https://opengameart.org/content/lowpoly-cars | FBX/OBJ/Blend | BasicCar, CopCar, **RaceCar**, SimpleCarHigh, SimpleCarShort, Taxi |
| Projeto histórias (C:\dev\godot) | já convertidos | GLB | ônibus escolar, caminhão de bombeiro, helicóptero, avião, foguete, bicicleta (podem ser copiados) |

## Animais (com animação)
| Pacote | Fonte | Formato | Animações | Modelos |
|---|---|---|---|---|
| **Gobkit (CC0)** | https://gobkit.com/api/free (índice com links diretos) | GLB com esqueleto | idle, **walk**, attack, dead | **180 animais com walk**. Baixados (20): Corgi, Duck, Elephant, Flamingo, Fox, Hare, Hippo, HolsteinCow, Lion, Ostrich, PalominoHorse, Penguin, Pig, Rhino, Rooster, Sheep, Tiger, Trex, Triceratops, Zebra. Outros disponíveis: dinossauros (Stegosaurus, Spinosaurus...), aves (Eagle, Peacock, Toucan...), fazenda (Bull, Calf, Lamb...), selvagens (Koala, Kangaroo-like Dingo, Gorilla...), insetos (60) |
| **Quaternius Farm Animals** | https://opengameart.org/content/lowpoly-animated-farm-animal-pack | FBX/OBJ/Blend | inclui **run** | Cow, Horse, Llama, Pig, Pug, Sheep, Zebra |
| **Quaternius Animal Pack Vol.2** | https://opengameart.org/content/animated-animales-low-poly | FBX/OBJ/Blend | inclui **run** | Cat, Dog, Eagle, Piranha, Wolf |

Observações:
- Gobkit: GLB pronto, mas o Godot 4.7 recusa os acessores esparsos → reexportar pelo Blender (mesmo conversor do projeto histórias).
- Quaternius: vem em FBX/Blend → converter para GLB no Blender (animação de corrida vem junto).
- Escalas variam por pacote: normalizar por altura/comprimento na conversão (cm vs m).
- Pacotes pagos encontrados e **não usados**: CGTrader/Superhive "Race Track Pack", "Cartoon Racetrack Accessories" (licença não-CC0).

## Fontes da pesquisa
- https://opengameart.org/content/racing-kit
- https://kenney.nl/assets/racing-kit
- https://opengameart.org/content/modular-racetrack-3d-models
- https://opengameart.org/content/lowpoly-cars
- https://opengameart.org/content/lowpoly-animated-farm-animal-pack
- https://opengameart.org/content/animated-animales-low-poly
- https://quaternius.itch.io/lowpoly-animated-animals (6 animais com run; download via itch, não baixado)
- https://gobkit.com/api/free
