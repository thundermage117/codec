cmake_minimum_required(VERSION 3.16)
project(CodecExplorer)

# Redirect all executables to the top-level build directory
set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR})

# Redirect all libraries (.a or .lib) to a 'lib' folder inside build
set(CMAKE_ARCHIVE_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/lib)

add_subdirectory(core)
add_subdirectory(apps/native)