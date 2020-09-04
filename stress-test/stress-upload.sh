#!/usr/bin/env bash

set +e

green='\x1B[0;32m'
red='\x1B[0;31m'
plain='\x1B[0m' # No Color

export NODE_EXTRA_CA_CERTS="$(mkcert -CAROOT)/rootCA.pem"

pushd /Users/$USER/code/grid/stress-test/test-files

profile_param=test

main_filename=test

file_extension=png

files_batch_size=5

test_iterations=10000

prepareFiles() {
  for i in $(seq $files_batch_size)
  do
    echo "copy $main_filename.$file_extension as test_$i.$file_extension"
    cp "$main_filename.$file_extension" "test_$i.$file_extension"
  done
}

runStressUpload(){
  for i in $(seq $test_iterations);
  do
    for j in $(seq $files_batch_size);
    do
      fname="test_$j.$file_extension"
      echo "overwriting $fname"
      # overwriting file metadata to be able to get different file hash in grid
      exiftool -overwrite_original -rights=$(uuidgen) "$fname"
    done

    for j in $(seq $files_batch_size)
    do
     fname="test_$j.$file_extension"
     echo "uploading $fname"
     grid image:upload "$fname" --profile $profile_param &
    done

  done
}

mian(){
  prepareFiles
  runStressUpload
}

mian

popd


