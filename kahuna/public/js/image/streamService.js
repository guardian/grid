import Rx from 'rx';

const images = new Set();
const images$ = new Rx.BehaviorSubject([]);

function imageStream(images_) {
    if (images_) {
        images_.forEach(image => images.add(image));
        updateStream();
    }

    return { images$, add, remove, watchUpdates };
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


export default imageStream;
