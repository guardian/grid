import Rx from 'rx';

function imageStream(images_) {

    const images = new Set();
    const images$ = new Rx.BehaviorSubject([]);

    if (images_) {
        images_.forEach(image => images.add(image));
        updateStream();
    }

    function add(image) {
        images.add(image);
        updateStream();
    }

    function remove(image) {
        images.delete(image);
        updateStream();
    }

    function updateStream() {
        images$.onNext(Array.from(images.values()));
    }

    function zipImages(updates) {
        const updatedImages = images$.getValue().map(image => {
            const update = updates.find(update => update.data.id === image.data.id);
            return update || image;
        });

        images$.onNext(updatedImages);
    }

    function watchUpdates(...updates$) {
        updates$.forEach(update$ => {
            update$.subscribe(zipImages);
        });
    }

    return { images$, add, remove, watchUpdates };
}




export default imageStream;
