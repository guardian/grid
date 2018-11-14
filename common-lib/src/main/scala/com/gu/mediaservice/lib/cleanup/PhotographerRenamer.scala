package com.gu.mediaservice.lib.cleanup

import com.gu.mediaservice.model.ImageMetadata

object PhotographerRenamer extends MetadataCleaner {
  val names = Map(
    "Adam Warzawa" -> "Adam Warżawa",
    "Akos Stiller" -> "Ákos Stiller",
    "Albert Gonzalez Farran" -> "Albert González Farran",
    "Alecsandra Raluca Dragoi" -> "Alecsandra Raluca Drăgoi",
    "Alejandro Garcia" -> "Alejandro García",
    "Aleksander Kozminski" -> "Aleksander Koźmiński",
    "Alex Caparros" -> "Álex Caparrós",
    "Ali Balli" -> "Ali Ballı",
    "Ali Ihsan Ozturk" -> "Ali İhsan Öztürk",
    "Alik Keplicz" -> "Alik Kęplicz",
    "Alvaro Barrientos" -> "Álvaro Barrientos",
    "Alvin Baez" -> "Alvin Báez",
    "Andre Liohn" -> "André Liohn",
    "Andre Penner" -> "André Penner",
    "Andreea Campeanu" -> "Andreea Câmpeanu",
    "Andrej Isakovic" -> "Andrej Isaković",
    "Andres Kudacki" -> "Andrés Kudacki",
    "Angel Martinez" -> "Ángel Martínez",
    "Antonio Bronic" -> "Antonio Bronić",
    "Antonio Lacerda" -> "António Lacerda",
    "Arif Hudaverdi Yaman" -> "Arif Hüdaverdi Yaman",
    "Attila Kovacs" -> "Attila Kovács",
    "Aurelien Meunier" -> "Aurélien Meunier",
    "Aykut Unlupinar" -> "Aykut Ünlüpınar",
    "Aytac Unal" -> "Aytaç Ünal",
    "Azael Rodriguez" -> "Azael Rodríguez",
    "Balazs Mohai" -> "Balázs Mohai",
    "Bartlomiej Zborowski" -> "Bartłomiej Zborowski",
    "Benoit Bouchez" -> "Benoît Bouchez",
    "Benoit Doppagne" -> "Benoît Doppagne",
    "Benoit Goossens" -> "Benoît Goossens",
    "Benoit Jacques" -> "Benoît Jacques",
    "Benoit Pailley" -> "Benoît Pailley",
    "Benoit Peverelli" -> "Benoît Peverelli",
    "Benoit Peyrucq" -> "Benoît Peyrucq",
    "Benoit Tessier" -> "Benoît Tessier",
    "Benoite Fanton" -> "Benoîte Fanton",
    "Berk Ozkan" -> "Berk Özkan",
    "Bernadett Szabo" -> "Bernadett Szabó",
    "Bernat Armangue" -> "Bernat Armangué",
    "Bilgin S Sasmaz" -> "Bilgin S Şaşmaz",
    "Bjorn Larsson Rosvall" -> "Björn Larsson Rosvall",
    "Boris Kovacev" -> "Boris Kovačev",
    "Brendan Mcdermid" -> "Brendan McDermid",
    "Bulent Kilic" -> "Bülent Kılıç",
    "Burak Cingi" -> "Burak Çıngı",
    "Burhan Ozbilici" -> "Burhan Özbilici",
    "Camilo Jose Vergara" -> "Camilo José Vergara",
    "Carlos Alvarez" -> "Carlos Álvarez",
    "Carlos Barria" -> "Carlos Barría",
    "Carlos Garcia Rawlins" -> "Carlos García Rawlins",
    "Cathal Mcnaughton" -> "Cathal McNaughton",
    "Cem Oksuz" -> "Cem Öksüz",
    "Cesar Manso" -> "César Manso",
    "Christof Koepsel" -> "Christof Köpsel",
    "Christophe Petit Tesson" -> "Christophe Petit-Tesson",
    "Cristobal Herrera" -> "Cristóbal Herrera",
    "Cristobal Venegas" -> "Cristóbal Venegas",
    "Czarek Sokolowski" -> "Czarek Sokołowski",
    "Dado Ruvic" -> "Dado Ruvić",
    "Damir Sagolj" -> "Damir Šagolj",
    "Daniel Garcia" -> "Daniel García",
    "Daniel Mihailescu" -> "Daniel Mihăilescu",
    "Daniel Muñoz" -> "Daniel Muñoz",
    "Darko Bandic" -> "Darko Bandić",
    "Darko Vojinovic" -> "Darko Vojinović",
    "Dave M Benett" -> "David M Benett",
    "David Mcnew" -> "David McNew",
    "David W Cerny" -> "David W Černý",
    "David Wolff - Patrick" -> "David Wolff-Patrick",
    "Dawid Zuchowicz" -> "Dawid Żuchowicz",
    "Diana Sanchez" -> "Diana Sánchez",
    "Don Mcphee" -> "Don McPhee",
    "Dusan Vranic" -> "Dušan Vranić",
    "Eduardo Munoz" -> "Eduardo Muñoz",
    "Eduardo Munoz Alvarez" -> "Eduardo Muñoz",
    "Elif Ozturk" -> "Elif Öztürk",
    "Erdem Sahin" -> "Erdem Şahin",
    "Eric Piermont" -> "Éric Piermont",
    "Esteban Felix" -> "Esteban Félix",
    "Eugene Garcia" -> "Eugene García",
    "Francois Duhamel" -> "François Duhamel",
    "Francois Durand" -> "François Durand",
    "Francois G Durand" -> "François Durand",
    "Francois Guillot" -> "François Guillot",
    "Francois Lenoir" -> "François Lenoir",
    "Francois Lepage " -> "François Lepage ",
    "Francois Lo Presti" -> "François Lo Presti",
    "Francois Mori" -> "François Mori",
    "Francois Nascimbeni" -> "François Nascimbeni",
    "Francois Nel" -> "François Nel",
    "Francois Pauletto" -> "François Pauletto",
    "Francois Walschaerts" -> "François Walschaerts",
    "Francois Xavier Marit" -> "François-Xavier Marit",
    "Francois-Xavier Marit" -> "François-Xavier Marit",
    "Gerard Julien" -> "Gérard Julien",
    "Gergely Janossy" -> "Gergely Jánossy",
    "Goran Kovacic" -> "Goran Kovačić",
    "Goran Tomasevic" -> "Goran Tomašević",
    "Grzegorz Michalowski" -> "Grzegorz Michałowski",
    "Gyorgy Varga" -> "György Varga",
    "Hakan Burak Altunoz" -> "Hakan Burak Altunöz",
    "Hannah Mckay" -> "Hannah McKay",
    "Hector Guerrero" -> "Héctor Guerrero",
    "Hector Retamal" -> "Héctor Retamal",
    "Helene Pambrun" -> "Hélène Pambrun",
    "Herika Martinez" -> "Hérika Martínez",
    "Ian Macnicol" -> "Ian MacNicol",
    "Inti Ocon" -> "Inti Ocón",
    "Ints Kalnins" -> "Ints Kalniņš",
    "Isa Terli" -> "İsa Terli",
    "Jakub Kaminski" -> "Jakub Kamiński",
    "Javier Garcia" -> "Javier García",
    "Javier Lizon" -> "Javier Lizón",
    "Jean-Francois Badias" -> "Jean-François Badias",
    "Jean-Francois Monier" -> "Jean-François Monier",
    "Jean-Paul Pelissier" -> "Jean-Paul Pélissier",
    "Jean-Sebastien Evrard" -> "Jean-Sébastien Evrard",
    "Jerome Delay" -> "Jérôme Delay",
    "Jerome Favre" -> "Jérôme Favre",
    "Jerome Prebois" -> "Jérôme Prébois",
    "Jerome Prevost" -> "Jérôme Prévost",
    "Jerome Sessini" -> "Jérôme Sessini",
    "Jesus Diges" -> "Jesús Diges",
    "Jesus Serrano Redondo" -> "Jesús Serrano Redondo",
    "Johan Ordonez" -> "Johan Ordóñez",
    "John Macdougall" -> "John MacDougall",
    "John Vizcaino" -> "John Vizcaíno",
    "Jon Gustafsson" -> "Jón Gústafsson",
    "Jorg Carstensen" -> "Jörg Carstensen",
    "Jorge Dan Lopez" -> "Jorge Dan López",
    "Jorge Saenz" -> "Jorge Sáenz",
    "Jose Cabezas" -> "José Cabezas",
    "Jose Cendon" -> "José Cendón",
    "Jose Fragozo" -> "José Fragozo",
    "Jose Fuste Raga" -> "José Fuste Raga",
    "Jose Giribas" -> "José Giribás",
    "Jose Jacome" -> "José Jácome",
    "Jose Jordan" -> "José Jordan",
    "Jose Luis Gonzalez" -> "José Luis González",
    "Jose Luis Gonzalez" -> "José Luis González",
    "Jose Luis Magana" -> "José Luis Magaña",
    "Jose Luis Pelaez" -> "José Luis Peláez",
    "Jose Luis Saavedra" -> "José Luis Saavedra",
    "Jose Manuel Vidal" -> "José Manuel Vidal",
    "Jose Miguel Gomez" -> "José Miguel Gómez",
    "Jose Palazon" -> "José Palazón",
    "Jose Sena Goulao" -> "José Sena Goulão",
    "Juan Naharro Gimenez" -> "Juan Naharro Giménez",
    "Kai Schwoerer" -> "Kai Schwörer",
    "Kamil Altiparmak" -> "Kamil Altıparmak",
    "Kamil Krzaczynski" -> "Kamil Krzaczyński",
    "Kayhan Ozer" -> "Kayhan Özer",
    "Kc Mcginnis" -> "KC McGinnis",
    "Kerim Okten" -> "Kerim Ökten",
    "Laszlo Balogh" -> "László Balogh",
    "Laurence Mathieu-Leger" -> "Laurence Mathieu-Léger",
    "Laurent Gillieron" -> "Laurent Gilliéron",
    "Laurentiu Garofeanu" -> "Laurențiu Garofeanu",
    "Lech Muszynski" -> "Lech Muszyński",
    "Leo Correa" -> "Léo Corrêa",
    "Leonhard Foeger" -> "Leonhard Föger",
    "Lise Aserud" -> "Lise Åserud",
    "Lluis Gene" -> "Lluís Gené",
    "Logan Mcmillan" -> "Logan McMillan",
    "Loic Aedo" -> "Loïc Aedo",
    "Loic Venance" -> "Loïc Venance",
    "Lucio Tavora" -> "Lúcio Távora",
    "Lukasz Cynalewski" -> "Łukasz Cynalewski",
    "Lukasz Szelemej" -> "Łukasz Szełemej",
    "Maciej Kulczynski" -> "Maciej Kulczyński",
    "Maciek Jazwiecki" -> "Maciek Jaźwiecki",
    "Mahmut Serdar Alakus" -> "Mahmut Serdar Alakuş",
    "Manu Fernandez" -> "Manu Fernández",
    "Marcelo Del Pozo" -> "Marcelo del Pozo",
    "Marcelo Sayao" -> "Marcelo Sayão",
    "Marcio Jose Sanchez" -> "Marcio José Sánchez",
    "Mario Arturo Martinez" -> "Mario Arturo Martínez",
    "Mario Vazquez" -> "Mario Vázquez",
    "Marko Djurica" -> "Marko Đurica",
    "Marko Drobnjakovic" -> "Marko Drobnjaković",
    "Martin Mejia" -> "Martín Mejía",
    "Matthias Schrader" -> "Matthias Schräder",
    "Mauricio Duenas Castaneda" -> "Mauricio Dueñas Castañeda",
    "Michal Cízek" -> "Michal Čížek",
    "Michelle Mcloughlin" -> "Michelle McLoughlin",
    "Miguel Gutierrez" -> "Miguel Gutiérrez",
    "Milos Bicanski" -> "Miloš Bičanski",
    "Miro Kuzmanovic" -> "Miro Kuzmanović",
    "Moises Castillo" -> "Moisés Castillo",
    "Morne de Klerk" -> "Morné de Klerk",
    "Mustafa Ciftci" -> "Mustafa Çiftçi",
    "Niklas Halle’N" -> "Niklas Halle’n",
    "Oscar del Pozo" -> "Óscar del Pozo",
    "Osman Orsal" -> "Osman Örsal",
    "Ozan Kose" -> "Ozan Köse",
    "Ozge Elif Kizil" -> "Özge Elif Kızıl",
    "Ozkan Bilgin" -> "Özkan Bilgin",
    "P-M Heden" -> "P-M Hedén",
    "Pablo Blazquez Dominguez" -> "Pablo Blázquez Domínguez",
    "Pablo Martinez Monsivais" -> "Pablo Martínez Monsiváis",
    "Pal Hansen" -> "Pål Hansen",
    "Patricia de Melo Moreira" -> "Patrícia de Melo Moreira",
    "Paul Mcerlane" -> "Paul McErlane",
    "Pawel Jaszczuk" -> "Paweł Jaszczuk",
    "Pawel Kopczynski" -> "Paweł Kopczyński",
    "Petar Kujundzic" -> "Petar Kujundžić",
    "Peter Dejong" -> "Peter de Jong",
    "Pietro D’aprano" -> "Pietro D’Aprano",
    "Rade Prelic" -> "Rade Prelić",
    "Radek Mica" -> "Radek Miča",
    "Rafal Guz" -> "Rafał Guz",
    "Ramon Espinosa" -> "Ramón Espinosa",
    "Raul Arboleda" -> "Raúl Arboleda",
    "Raul Caro Cadenas" -> "Raúl Caro Cadenas",
    "Reinnier Kaze" -> "Reinnier Kazé",
    "Remi Chauvin" -> "Rémi Chauvin",
    "Remus Tiplea" -> "Remus Țiplea",
    "Remy Gabalda" -> "Rémy Gabalda",
    "Ricardo Mazalan" -> "Ricardo Mazalán",
    "Rodrigo Buendia" -> "Rodrigo Buendía",
    "Sanjin Strukic" -> "Sanjin Strukić",
    "Sashenka Gutierrez" -> "Sáshenka Gutiérrez",
    "Sebastian Tataru" -> "Sebastian Tătaru",
    "Sebastiao Salgado " -> "Sebastião Salgado ",
    "Sebastien Bozon" -> "Sébastien Bozon",
    "Sebastien Martinet" -> "Sébastien Martinet",
    "Sebastien Nogier" -> "Sébastien Nogier",
    "Sebastien Salom Gomis" -> "Sébastien Salom-Gomis",
    "Sebastien Thibault" -> "Sébastien Thibault",
    "Sergio Morae" -> "Sérgio Morae",
    "Sergio Perez" -> "Sergio Pérez",
    "Srdjan Stevanovic" -> "Srđan Stevanović",
    "Srdjan Suki" -> "Srđan Suki",
    "Stanislaw Rozpedzik" -> "Stanisław Rozpędzik",
    "Stephane Cardinale" -> "Stéphane Cardinale",
    "Stephane de Sakutin" -> "Stéphane de Sakutin",
    "Stephane Mahe" -> "Stéphane Mahé",
    "Stephanie Lecocq" -> "Stéphanie Lecocq",
    "Szilard Koszticsak" -> "Szilárd Koszticsák",
    "Tamas Kaszas" -> "Tamás Kaszás",
    "Tamas Kovacs" -> "Tamás Kovács",
    "Tayfun Coskun" -> "Tayfun Coşkun",
    "Thilo Schmuelgen" -> "Thilo Schmülgen",
    "Tolga Bozoglu" -> "Tolga Bozoğlu",
    "Tytus Zmijewski" -> "Tytus Żmijewski",
    "Umit Bektas" -> "Ümit Bektaş",
    "Vadim Ghirda" -> "Vadim Ghirdă",
    "Valda Kalnina" -> "Valda Kalniņa",
    "Valerie Gache" -> "Valérie Gache",
    "Valerie Macon" -> "Valérie Macon",
    "Valery Hache" -> "Valéry Hache",
    "Venturelli" -> "Daniele Venturelli",
    "Vincent Perez" -> "Vincent Pérez",
    "Vit Simanek" -> "Vít Šimánek",
    "Vladimir Simicek" -> "Vladimír Šimíček",
    "Wiktor Dabkowski" -> "Wiktor Dąbkowski",
    "Wojciech Kruczynski" -> "Wojciech Kruczyński",
    "Wojtek Radwanski" -> "Wojtek Radwański",
    "Yasin Akgul" -> "Yasin Akgül",
    "Yuri Cortez" -> "Yuri Cortéz",
    "Zoltan Balogh" -> "Zoltán Balogh",
    "Zoltan Gergely Kelemen" -> "Zoltán Gergely Kelemen",
    "Zsolt Czegledi" -> "Zsolt Czeglédi",
    "Zvonimir Barisin" -> "Zvonimir Barišin"
  )

  override def clean(metadata: ImageMetadata): ImageMetadata = {
    metadata.copy(byline = metadata.byline.flatMap(names.get(_).orElse(metadata.byline)))
  }
}
